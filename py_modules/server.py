import asyncio
import json
import urllib.parse

import decky


class SSEManager:
    """Manages active Server-Sent Events (SSE) connections for zero-latency dashboard sync."""

    def __init__(self):
        self._clients: set[asyncio.StreamWriter] = set()
        self._lock = asyncio.Lock()

    async def add_client(self, writer: asyncio.StreamWriter, initial_data: dict | None = None):
        async with self._lock:
            self._clients.add(writer)
        decky.logger.debug("SSE client connected; total clients: %d", len(self._clients))
        if initial_data:
            await self._send_to_writer(writer, "status", initial_data)

    async def remove_client(self, writer: asyncio.StreamWriter):
        async with self._lock:
            self._clients.discard(writer)
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

    async def broadcast(self, event_name: str, data: dict):
        """Broadcast an SSE event payload to all currently connected dashboards."""
        if not self._clients:
            return
        async with self._lock:
            current_clients = list(self._clients)

        dead_clients = []
        for client in current_clients:
            ok = await self._send_to_writer(client, event_name, data)
            if not ok:
                dead_clients.append(client)

        if dead_clients:
            async with self._lock:
                for dead in dead_clients:
                    self._clients.discard(dead)

    async def _send_to_writer(self, writer: asyncio.StreamWriter, event_name: str, data: dict) -> bool:
        try:
            payload = json.dumps(data)
            msg = f"event: {event_name}\ndata: {payload}\n\n".encode("utf-8")
            writer.write(msg)
            await writer.drain()
            return True
        except Exception:
            return False

    async def send_heartbeats(self):
        """Keep-alive heartbeat sent every 15s to keep connections open through proxies."""
        if not self._clients:
            return
        async with self._lock:
            current_clients = list(self._clients)
        dead = []
        comment = b": keepalive\n\n"
        for client in current_clients:
            try:
                client.write(comment)
                await client.drain()
            except Exception:
                dead.append(client)
        if dead:
            async with self._lock:
                for d in dead:
                    self._clients.discard(d)
