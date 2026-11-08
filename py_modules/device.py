import asyncio
import os
import socket
import ssl
import subprocess

import decky
from py_modules.common import SSL_CERT, SSL_KEY


def resolve_device_hostname() -> str:
    try:
        name = socket.gethostname()
        return name if name else "Steam Deck"
    except Exception:
        return "Steam Deck"


def _get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        return "127.0.0.1"


def _get_mdns_host() -> str:
    try:
        return f"{socket.gethostname()}.local"
    except Exception:
        return _get_lan_ip()


def _ensure_ssl_cert() -> tuple[ssl.SSLContext, None] | tuple[None, str]:
    if not os.path.isfile(SSL_CERT) or not os.path.isfile(SSL_KEY):
        decky.logger.info("SSL cert not found at %s, generating...", SSL_CERT)
        mdns_host = _get_mdns_host()
        os.makedirs(os.path.dirname(SSL_CERT), exist_ok=True)
        try:
            result = subprocess.run([
                "openssl", "req", "-x509", "-newkey", "rsa:2048",
                "-keyout", SSL_KEY, "-out", SSL_CERT,
                "-days", "3650", "-nodes",
                "-subj", f"/CN={mdns_host}",
                "-config", "/dev/null",
            ], capture_output=True, text=True)
            if result.returncode != 0:
                msg = f"openssl failed (code {result.returncode}): {result.stderr.strip()}"
                decky.logger.error(msg)
                return None, msg
        except Exception as e:
            msg = f"Failed to run openssl: {e}"
            decky.logger.error(msg)
            return None, msg
    else:
        decky.logger.info("SSL cert found at %s", SSL_CERT)
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(SSL_CERT, SSL_KEY)
        return ctx, None
    except Exception as e:
        msg = f"Failed to load SSL cert: {e}"
        decky.logger.error(msg)
        return None, msg


def shutdown_system_sync() -> None:
    """Power off the Steam Deck cleanly."""
    subprocess.Popen(["systemctl", "poweroff"])


class SuspendResumeMonitor:
    """Monitors systemd-logind via busctl for SteamOS suspend and resume events."""

    def __init__(self, on_sleep=None, on_resume=None):
        self.on_sleep = on_sleep
        self.on_resume = on_resume
        self._task: asyncio.Task | None = None
        self._proc: asyncio.subprocess.Process | None = None
        self._running = False

    def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._monitor_loop())

    async def stop(self):
        self._running = False
        if self._proc:
            try:
                self._proc.terminate()
                await self._proc.wait()
            except Exception:
                pass
            self._proc = None
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _monitor_loop(self):
        """Run busctl monitor loop on system bus for org.freedesktop.login1 PrepareForSleep."""
        if not os.path.exists("/usr/bin/busctl") and not os.path.exists("/bin/busctl"):
            decky.logger.debug("busctl not present on host; suspend monitor inactive")
            return

        while self._running:
            try:
                self._proc = await asyncio.create_subprocess_exec(
                    "busctl", "--system", "monitor", "org.freedesktop.login1",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                if not self._proc.stdout:
                    break

                while self._running:
                    line = await self._proc.stdout.readline()
                    if not line:
                        break
                    text = line.decode("utf-8", errors="ignore")
                    if "Member=PrepareForSleep" in text or "PrepareForSleep" in text:
                        if "true" in text.lower():
                            decky.logger.info("Steam Deck entering suspend (PrepareForSleep=true)")
                            if self.on_sleep:
                                try:
                                    if asyncio.iscoroutinefunction(self.on_sleep):
                                        await self.on_sleep()
                                    else:
                                        self.on_sleep()
                                except Exception as err:
                                    decky.logger.warning("Suspend callback error: %s", err)
                        elif "false" in text.lower():
                            decky.logger.info("Steam Deck woke from suspend (PrepareForSleep=false) - recovering")
                            if self.on_resume:
                                try:
                                    await asyncio.sleep(1.5)
                                    if asyncio.iscoroutinefunction(self.on_resume):
                                        await self.on_resume()
                                    else:
                                        self.on_resume()
                                except Exception as err:
                                    decky.logger.warning("Resume recovery callback error: %s", err)
            except asyncio.CancelledError:
                break
            except Exception as e:
                decky.logger.debug("Suspend monitor encountered error: %s, retrying in 10s", e)
                await asyncio.sleep(10)
