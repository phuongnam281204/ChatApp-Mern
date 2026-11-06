import React from "react";
import { FiCheck, FiMessageSquare, FiPlus, FiSearch } from "react-icons/fi";
import Avatar from "./Avatar";
import { apiFetch } from "../lib/api";
import { displayName } from "../lib/chat";

/**
 * Search registered users.
 * mode "direct": each row has a "Nhắn tin" button (onPick).
 * mode "select": each row toggles selection (selectedIds / onToggle).
 * excludeIds: users that should not be offered (e.g. current group members).
 */
export default function PeopleSearch({ mode, excludeIds = [], selectedIds, onToggle, onPick, onError, emptyHint }) {
  const [query, setQuery] = React.useState("");
  const [people, setPeople] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const exclude = React.useMemo(() => new Set(excludeIds.map(String)), [excludeIds]);

  const search = async (event) => {
    event?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const data = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      setPeople(data.users || []);
      setSearched(true);
    } catch (error) {
      onError?.(error.message);
    } finally {
      setSearching(false);
    }
  };

  const visible = people.filter((person) => !exclude.has(String(person.id)));

  return (
    <>
      <form className="people-search" onSubmit={search}>
        <label className="search-box">
          <FiSearch />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tên, hoặc email đầy đủ"
            aria-label="Tìm người theo tên hoặc email đầy đủ"
          />
        </label>
        <button className="primary-action compact" disabled={searching || query.trim().length < 2}>
          {searching ? "Đang tìm…" : "Tìm"}
        </button>
      </form>

      <div className="people-results">
        {visible.map((person) => {
          const selected = selectedIds?.has(String(person.id));
          const name = displayName(person);
          return (
            <article className="person-row" key={person.id}>
              <Avatar src={person.avatarUrl} name={name} />
              <span className="person-main">
                <strong>{name}</strong>
                <small>{person.email}</small>
              </span>
              {mode === "direct" ? (
                <button type="button" title="Nhắn tin" aria-label={`Nhắn tin cho ${name}`} onClick={() => onPick?.(person)}>
                  <FiMessageSquare />
                </button>
              ) : (
                <button
                  type="button"
                  className={selected ? "is-selected" : ""}
                  title={selected ? "Bỏ chọn" : "Chọn"}
                  aria-label={`${selected ? "Bỏ chọn" : "Chọn"} ${name}`}
                  aria-pressed={Boolean(selected)}
                  onClick={() => onToggle?.(person)}
                >
                  {selected ? <FiCheck /> : <FiPlus />}
                </button>
              )}
            </article>
          );
        })}

        {!visible.length ? (
          <div className="empty-state">
            <span>{searched ? "Không tìm thấy ai phù hợp." : emptyHint}</span>
          </div>
        ) : null}
      </div>
    </>
  );
}
