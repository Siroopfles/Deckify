import { FC, useState, useEffect, useRef } from "react";
import { Focusable, ModalRoot, TextField, DialogButton } from "@decky/ui";
import { callable } from "@decky/api";
import { FaMusic, FaCompactDisc, FaSearch, FaTimes } from "react-icons/fa";
import { AlbumItem, PlaylistItem, SoundtrackPlaylist } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow } from "../common/InteractiveRow";
import { toSelection } from "./soundtrackUtils";

const ModalRootAny = ModalRoot as any;
const TextFieldAny = TextField as any;

const backendGetPlaylists = callable<[number], { ok: boolean; playlists?: PlaylistItem[] }>("get_playlists");
const backendGetSavedAlbums = callable<[number], { ok: boolean; albums?: AlbumItem[] }>("get_saved_albums");
const backendSearchSpotify = callable<
  [string, string, number],
  { ok: boolean; playlists?: PlaylistItem[]; albums?: AlbumItem[]; error?: string }
>("search_spotify");

export type PickerTab = "playlists" | "albums" | "search";

export interface PlaylistPickerModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  closeModal?: () => void;
  onSelect: (item: SoundtrackPlaylist) => void;
  initialPlaylists?: PlaylistItem[];
  initialAlbums?: AlbumItem[];
}

export const PlaylistPickerModal: FC<PlaylistPickerModalProps> = ({
  isOpen = true,
  onClose,
  closeModal,
  onSelect,
  initialPlaylists,
  initialAlbums,
}) => {
  const [activeTab, setActiveTab] = useState<PickerTab>("playlists");
  const [playlists, setPlaylists] = useState<PlaylistItem[]>(initialPlaylists || []);
  const [albums, setAlbums] = useState<AlbumItem[]>(initialAlbums || []);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<(PlaylistItem | AlbumItem)[]>([]);
  const [loading, setLoading] = useState(false);
  const searchTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === "playlists" && playlists.length === 0) {
      setLoading(true);
      backendGetPlaylists(0)
        .then((res) => {
          if (res?.ok && Array.isArray(res.playlists)) {
            setPlaylists(res.playlists);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else if (activeTab === "albums" && albums.length === 0) {
      setLoading(true);
      backendGetSavedAlbums(0)
        .then((res) => {
          if (res?.ok && Array.isArray(res.albums)) {
            setAlbums(res.albums);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, activeTab]);

  // Debounced Spotify Search (T-07-04: 300ms delay)
  useEffect(() => {
    if (!isOpen || activeTab !== "search") return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setLoading(true);
      backendSearchSpotify(q, "playlist,album", 20)
        .then((res) => {
          if (res?.ok) {
            const combined: (PlaylistItem | AlbumItem)[] = [
              ...(res.playlists || []),
              ...(res.albums || []),
            ];
            setSearchResults(combined);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [isOpen, activeTab, searchQuery]);

  if (!isOpen) return null;

  const handleClose = () => {
    closeModal?.();
    onClose?.();
  };

  const handlePick = (item: PlaylistItem | AlbumItem) => {
    onSelect(toSelection(item));
    handleClose();
  };

  const renderItems = (items: (PlaylistItem | AlbumItem)[], emptyMsg: string) => {
    if (loading) {
      return <div style={{ padding: 20, textAlign: "center", opacity: 0.6, fontSize: 12 }}>Loading...</div>;
    }
    if (items.length === 0) {
      return <div style={{ padding: 20, textAlign: "center", opacity: 0.5, fontSize: 12 }}>{emptyMsg}</div>;
    }
    return (
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((item) => {
          const subtitle =
            "artist" in item && item.artist
              ? item.artist
              : item.track_count !== undefined
              ? `${item.track_count} tracks`
              : "Playlist";
          return (
            <InteractiveRow
              key={item.uri || item.id}
              onClick={() => handlePick(item)}
              style={{ gap: 10, padding: "8px 10px" }}
            >
              {item.image_url ? (
                <DeckifyImage src={item.image_url} width={36} height={36} style={{ borderRadius: 4, flexShrink: 0 }} />
              ) : (
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 4,
                    background: "rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {"artist" in item ? <FaCompactDisc size={14} color="#888" /> : <FaMusic size={14} color="#888" />}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {subtitle}
                </div>
              </div>
            </InteractiveRow>
          );
        })}
      </Focusable>
    );
  };

  return (
    <ModalRootAny onCancel={handleClose} closeModal={handleClose}>
      <Focusable
        flow-children="column"
        style={{
          padding: 16,
          minWidth: 420,
          maxWidth: "90vw",
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Select Soundtrack Music</h3>
          <DialogButton
            onClick={handleClose}
            style={{ minWidth: 32, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}
          >
            <FaTimes size={12} />
            <span>Close</span>
          </DialogButton>
        </div>

        {/* Tab Selector Bar */}
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
          {(
            [
              { id: "playlists", label: "My Playlists" },
              { id: "albums", label: "My Albums" },
              { id: "search", label: "Spotify Search" },
            ] as { id: PickerTab; label: string }[]
          ).map((tab) => (
            <InteractiveRow
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              active={activeTab === tab.id}
              style={{
                flex: 1,
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                padding: "8px 10px",
              }}
            >
              {tab.label}
            </InteractiveRow>
          ))}
        </Focusable>

        {/* Search Input when in Spotify Search tab */}
        {activeTab === "search" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FaSearch size={13} style={{ opacity: 0.6, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <TextFieldAny
                value={searchQuery}
                onChange={(e: any) => setSearchQuery(typeof e === "string" ? e : e?.target?.value || "")}
                placeholder="Search playlists or albums..."
              />
            </div>
          </div>
        )}

        {/* Content List */}
        <div style={{ flex: 1, overflowY: "auto", maxHeight: 360 }}>
          {activeTab === "playlists" && renderItems(playlists, "No playlists found.")}
          {activeTab === "albums" && renderItems(albums, "No saved albums found.")}
          {activeTab === "search" &&
            renderItems(
              searchResults,
              searchQuery.trim() ? "No matching playlists or albums." : "Type to search Spotify."
            )}
        </div>
      </Focusable>
    </ModalRootAny>
  );
};
