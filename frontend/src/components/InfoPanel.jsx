import React from "react";
import {
  FiBell,
  FiBellOff,
  FiCamera,
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiEdit2,
  FiFileText,
  FiLink,
  FiLogOut,
  FiSearch,
  FiUserMinus,
  FiUserPlus,
  FiX,
} from "react-icons/fi";
import Avatar from "./Avatar";
import Dialog from "./Dialog";
import PeopleSearch from "./PeopleSearch";
import { apiFetch, apiUpload } from "../lib/api";
import {
  conversationAvatar,
  conversationTitle,
  displayName,
  formatBytes,
  formatListTime,
  isGroupOwner,
  otherMember,
  splitLinks,
} from "../lib/chat";

function Section({ title, open, onToggle, children }) {
  return (
    <section className="zalo-info-section">
      <button type="button" className="zalo-section-title" aria-expanded={open} onClick={onToggle}>
        <strong>{title}</strong>
        {open ? <FiChevronDown /> : <FiChevronRight />}
      </button>
      {open ? children : null}
    </section>
  );
}

function useMedia(conversationId, kind, enabled) {
  const [state, setState] = React.useState({ items: null, error: "" });
  React.useEffect(() => {
    if (!enabled || !conversationId) return undefined;
    let alive = true;
    setState({ items: null, error: "" });
    apiFetch(`/api/conversations/${conversationId}/media?kind=${kind}`)
      .then((data) => alive && setState({ items: data.messages || [], error: "" }))
      .catch((error) => alive && setState({ items: [], error: error.message }));
    return () => {
      alive = false;
    };
  }, [conversationId, kind, enabled]);
  return state;
}

function AddMembersDialog({ conversation, onClose, onDone, setError }) {
  const [selected, setSelected] = React.useState(() => new Map());
  const [busy, setBusy] = React.useState(false);
  const memberIds = React.useMemo(() => (conversation.members || []).map((m) => String(m.id)), [conversation.members]);
  const selectedIds = React.useMemo(() => new Set(selected.keys()), [selected]);

  const toggle = (person) =>
    setSelected((prev) => {
      const next = new Map(prev);
      const id = String(person.id);
      if (next.has(id)) next.delete(id);
      else next.set(id, person);
      return next;
    });

  const submit = async () => {
    setBusy(true);
    try {
      const data = await apiFetch(`/api/conversations/${conversation.id}/members`, {
        method: "POST",
        body: JSON.stringify({ memberIds: Array.from(selected.keys()) }),
      });
      onDone(data.conversation);
    } catch (error) {
      setError?.(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog label="Thêm thành viên" onClose={onClose} className="zalo-account-modal add-members-modal">
      <header className="zalo-account-modal-header">
        <strong>Thêm thành viên</strong>
        <button type="button" onClick={onClose} aria-label="Đóng">
          <FiX />
        </button>
      </header>
      <div className="add-members-body">
        <PeopleSearch
          mode="select"
          excludeIds={memberIds}
          selectedIds={selectedIds}
          onToggle={toggle}
          onError={setError}
          emptyHint="Tìm người theo tên hoặc email đầy đủ để thêm vào nhóm."
        />
      </div>
      <footer className="zalo-account-modal-footer">
        <button type="button" className="primary-action" disabled={busy || selected.size === 0} onClick={submit}>
          {busy ? "Đang thêm…" : selected.size ? `Thêm ${selected.size} người` : "Chọn người để thêm"}
        </button>
      </footer>
    </Dialog>
  );
}

function MediaList({ conversationId, kind }) {
  const { items, error } = useMedia(conversationId, kind, true);
  if (items === null) return <p className="info-muted">Đang tải…</p>;
  if (error) return <p className="info-muted">{error}</p>;
  if (!items.length) {
    const label = kind === "image" ? "ảnh" : kind === "file" ? "file" : "link";
    return <p className="info-muted">Chưa có {label} nào được chia sẻ.</p>;
  }

  if (kind === "image") {
    return (
      <div className="zalo-media-grid">
        {items.map((m) => (
          <a key={m.id} href={m.fileUrl} target="_blank" rel="noopener noreferrer" title={m.fileName}>
            <img src={m.fileUrl} alt={m.fileName || "Ảnh"} loading="lazy" />
          </a>
        ))}
      </div>
    );
  }

  if (kind === "file") {
    return (
      <ul className="info-list">
        {items.map((m) => (
          <li key={m.id}>
            <a href={m.fileUrl} target="_blank" rel="noopener noreferrer" download={m.fileName}>
              <FiFileText />
              <span>
                <strong>{m.fileName}</strong>
                <small>
                  {formatBytes(m.fileSize)} · {formatListTime(m.createdAt)}
                </small>
              </span>
            </a>
          </li>
        ))}
      </ul>
    );
  }

  const links = items.flatMap((m) =>
    splitLinks(m.text)
      .filter((part) => typeof part !== "string")
      .map((part, index) => ({ key: `${m.id}-${index}`, url: part.url, at: m.createdAt })),
  );
  return (
    <ul className="info-list">
      {links.map((link) => (
        <li key={link.key}>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            <FiLink />
            <span>
              <strong>{link.url.replace(/^https?:\/\//, "")}</strong>
              <small>{formatListTime(link.at)}</small>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function InfoPanel({
  conversation,
  me,
  onlineUserIds,
  onConversationChanged,
  onLeft,
  onOpenSearch,
  onClose,
  setError,
  showToast,
  mediaVersion,
}) {
  const [open, setOpen] = React.useState({ members: true, image: false, file: false, link: false });
  const [adding, setAdding] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const avatarRef = React.useRef(null);

  React.useEffect(() => {
    setRenaming(false);
    setOpen({ members: true, image: false, file: false, link: false });
  }, [conversation?.id]);

  if (!conversation) {
    return (
      <aside className="zalo-info-panel">
        <header className="zalo-info-header">
          <strong>Thông tin</strong>
        </header>
        <p className="info-muted info-padded">Chọn một cuộc trò chuyện để xem thông tin.</p>
      </aside>
    );
  }

  const isGroup = conversation.type === "group";
  const owner = isGroupOwner(conversation, me);
  const title = conversationTitle(conversation, me);
  const members = conversation.members || [];
  const other = otherMember(conversation, me);
  const toggle = (key) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      setError?.(error.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleMute = () =>
    run(async () => {
      const data = await apiFetch(`/api/conversations/${conversation.id}/mute`, {
        method: "POST",
        body: JSON.stringify({ muted: !conversation.mutedByMe }),
      });
      onConversationChanged?.(data.conversation);
      showToast?.(data.conversation.mutedByMe ? "Đã tắt thông báo cuộc trò chuyện này." : "Đã bật lại thông báo.");
    });

  const saveName = (event) => {
    event.preventDefault();
    run(async () => {
      const data = await apiFetch(`/api/conversations/${conversation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      onConversationChanged?.(data.conversation);
      setRenaming(false);
    });
  };

  const uploadGroupAvatar = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    run(async () => {
      const data = await apiUpload(`/api/conversations/${conversation.id}/avatar`, { file });
      onConversationChanged?.(data.conversation);
    });
  };

  const removeMember = (member) => {
    if (!window.confirm(`Xoá ${displayName(member)} khỏi nhóm "${title}"?`)) return;
    run(async () => {
      await apiFetch(`/api/conversations/${conversation.id}/members/${member.id}`, { method: "DELETE" });
    });
  };

  const leave = () => {
    const note = owner && members.length > 1 ? " Quyền trưởng nhóm sẽ chuyển cho thành viên vào nhóm sớm nhất." : "";
    if (!window.confirm(`Rời nhóm "${title}"? Bạn sẽ không nhận tin nhắn của nhóm nữa.${note}`)) return;
    run(async () => {
      await apiFetch(`/api/conversations/${conversation.id}/members/${me.id}`, { method: "DELETE" });
      onLeft?.(conversation.id);
    });
  };

  return (
    <aside className="zalo-info-panel" aria-label="Thông tin cuộc trò chuyện">
      <header className="zalo-info-header">
        <strong>{isGroup ? "Thông tin nhóm" : "Thông tin hội thoại"}</strong>
        <button type="button" className="icon-button info-close" onClick={onClose} aria-label="Đóng thông tin">
          <FiX />
        </button>
      </header>

      <section className="zalo-info-profile">
        <Avatar src={conversationAvatar(conversation, me)} name={title} size="xl">
          {owner ? (
            <>
              <button type="button" className="zalo-avatar-camera" onClick={() => avatarRef.current?.click()} aria-label="Đổi ảnh nhóm" disabled={busy}>
                <FiCamera />
              </button>
              <input ref={avatarRef} type="file" accept="image/*" className="zalo-hidden-input" onChange={uploadGroupAvatar} />
            </>
          ) : null}
        </Avatar>

        {renaming ? (
          <form className="inline-edit" onSubmit={saveName}>
            <input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} aria-label="Tên nhóm" />
            <button type="submit" disabled={busy || !name.trim()} aria-label="Lưu tên nhóm">
              <FiCheck />
            </button>
            <button type="button" onClick={() => setRenaming(false)} aria-label="Huỷ">
              <FiX />
            </button>
          </form>
        ) : (
          <strong className="info-title">
            {title}
            {owner ? (
              <button
                type="button"
                onClick={() => {
                  setName(conversation.name || "");
                  setRenaming(true);
                }}
                aria-label="Đổi tên nhóm"
              >
                <FiEdit2 />
              </button>
            ) : null}
          </strong>
        )}
        <small>
          {isGroup
            ? `${members.length} thành viên`
            : onlineUserIds?.has?.(String(other?.id))
              ? "Đang hoạt động"
              : other?.email || ""}
        </small>
      </section>

      <section className="zalo-info-actions">
        <button type="button" onClick={toggleMute} disabled={busy} aria-pressed={Boolean(conversation.mutedByMe)}>
          {conversation.mutedByMe ? <FiBellOff /> : <FiBell />}
          <span>{conversation.mutedByMe ? "Bật thông báo" : "Tắt thông báo"}</span>
        </button>
        {isGroup ? (
          <button type="button" onClick={() => setAdding(true)}>
            <FiUserPlus />
            <span>Thêm thành viên</span>
          </button>
        ) : null}
        <button type="button" onClick={onOpenSearch}>
          <FiSearch />
          <span>Tìm tin nhắn</span>
        </button>
        {isGroup ? (
          <button type="button" className="is-danger" onClick={leave} disabled={busy}>
            <FiLogOut />
            <span>Rời nhóm</span>
          </button>
        ) : null}
      </section>

      {isGroup ? (
        <Section title={`Thành viên (${members.length})`} open={open.members} onToggle={() => toggle("members")}>
          <ul className="member-list">
            {members.map((member) => {
              const isMe = String(member.id) === String(me?.id);
              const isOwner = String(member.id) === String(conversation.createdBy);
              return (
                <li key={member.id}>
                  <Avatar src={member.avatarUrl} name={displayName(member)} size="small" online={onlineUserIds?.has?.(String(member.id))} />
                  <span>
                    <strong>
                      {displayName(member)}
                      {isMe ? " (bạn)" : ""}
                    </strong>
                    {isOwner ? <small>Trưởng nhóm</small> : null}
                  </span>
                  {owner && !isMe ? (
                    <button type="button" className="icon-button" onClick={() => removeMember(member)} disabled={busy} aria-label={`Xoá ${displayName(member)} khỏi nhóm`} title="Xoá khỏi nhóm">
                      <FiUserMinus />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <Section title="Ảnh" open={open.image} onToggle={() => toggle("image")}>
        <MediaList key={`image-${mediaVersion}`} conversationId={conversation.id} kind="image" />
      </Section>
      <Section title="File" open={open.file} onToggle={() => toggle("file")}>
        <MediaList key={`file-${mediaVersion}`} conversationId={conversation.id} kind="file" />
      </Section>
      <Section title="Link" open={open.link} onToggle={() => toggle("link")}>
        <MediaList key={`link-${mediaVersion}`} conversationId={conversation.id} kind="link" />
      </Section>

      {adding ? (
        <AddMembersDialog
          conversation={conversation}
          onClose={() => setAdding(false)}
          setError={setError}
          onDone={(updated) => {
            setAdding(false);
            onConversationChanged?.(updated);
          }}
        />
      ) : null}
    </aside>
  );
}
