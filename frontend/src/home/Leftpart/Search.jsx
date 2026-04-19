import React from "react";
import { FaSearch } from "react-icons/fa";
import { apiFetch } from "../../lib/api";
import { FiMessageSquare, FiPlus, FiCheck } from "react-icons/fi";

const Search = ({ onCreatedConversation, setError }) => {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [selected, setSelected] = React.useState(() => new Set());
  const [groupName, setGroupName] = React.useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    const query = q.trim();
    if (!query) {
      setResults([]);
      return;
    }

    try {
      const data = await apiFetch(
        `/api/users/search?q=${encodeURIComponent(query)}`,
      );
      setResults(data.users || []);
    } catch (err) {
      setError?.(err.message);
    }
  };

  const startDirect = async (userId) => {
    try {
      const data = await apiFetch("/api/conversations/direct", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      if (data?.conversation) {
        onCreatedConversation?.(data.conversation);
        setResults([]);
        setQ("");
      }
    } catch (err) {
      setError?.(err.message);
    }
  };

  const toggleSelect = (userId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const id = String(userId);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createGroup = async () => {
    const name = groupName.trim();
    if (!name) return;

    const memberIds = Array.from(selected);
    if (memberIds.length < 2) {
      setError?.("Group cần ít nhất 3 người (bạn + 2 người khác)");
      return;
    }

    try {
      const data = await apiFetch("/api/conversations/group", {
        method: "POST",
        body: JSON.stringify({ name, memberIds }),
      });
      if (data?.conversation) {
        onCreatedConversation?.(data.conversation);
        setSelected(new Set());
        setGroupName("");
        setResults([]);
        setQ("");
      }
    } catch (err) {
      setError?.(err.message);
    }
  };

  return (
    <div className="px-4 py-3">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <label className="input-soft rounded-xl px-3 py-2 flex items-center gap-2 flex-1">
            <FaSearch className="text-base muted" />
            <input
              type="text"
              className="grow outline-none bg-transparent"
              placeholder="Tìm kiếm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <button type="submit" className="btn-primary rounded-xl px-4">
            Tìm
          </button>
        </div>
      </form>

      {selected.size ? (
        <div
          className="mt-3 p-3 rounded-lg"
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid var(--border)",
          }}
        >
          <div
            className="text-sm font-semibold"
            style={{ color: "var(--text-other)" }}
          >
            Tạo nhóm ({selected.size + 1} người)
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 input-soft rounded-lg px-3 py-2 outline-none"
              placeholder="Tên nhóm"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary rounded-lg px-4 disabled:opacity-50"
              onClick={createGroup}
              disabled={groupName.trim().length === 0 || selected.size < 2}
            >
              Tạo
            </button>
          </div>
          <div className="text-xs muted mt-2">
            Chọn ít nhất 2 người để tạo group.
          </div>
        </div>
      ) : null}

      {results.length ? (
        <div
          className="mt-3 border rounded-lg overflow-hidden"
          style={{ borderColor: "var(--border)" }}
        >
          {results.map((u) => (
            <div key={u.id} className="w-full px-3 py-2 hover:bg-blue-50">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className="font-medium truncate"
                    style={{ color: "var(--text-other)" }}
                  >
                    {u.username}
                  </div>
                  <div className="text-sm muted truncate">{u.email}</div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rail-btn hover:bg-[var(--app-bg)]"
                    title="Chat 1-1"
                    onClick={() => startDirect(u.id)}
                  >
                    <FiMessageSquare className="text-lg" />
                  </button>
                  <button
                    type="button"
                    className={`rail-btn hover:bg-[var(--app-bg)] ${
                      selected.has(String(u.id)) ? "rail-btn-active" : ""
                    }`}
                    title="Thêm vào nhóm"
                    onClick={() => toggleSelect(u.id)}
                  >
                    {selected.has(String(u.id)) ? (
                      <FiCheck className="text-lg" />
                    ) : (
                      <FiPlus className="text-lg" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default Search;
