import React from "react";
import Search from "./Search";
import User from "./User";
import Logout from "./Logout";
import { FiMessageSquare, FiUsers, FiSettings } from "react-icons/fi";

const Left = ({
  me,
  conversations,
  selectedConversation,
  onSelectConversation,
  onConversationsChanged,
  setError,
  onLogout,
  onlineUserIds,
  activeSection = "chats",
  onSectionChange,
}) => {
  const meInitial = (me?.username || me?.email || "U")
    .slice(0, 1)
    .toUpperCase();

  const showChats = activeSection === "chats";

  return (
    <div className={`${showChats ? "w-[380px]" : "w-[64px]"} flex h-full`}>
      {/* Left rail */}
      <div className="rail flex flex-col items-center py-3">
        <div
          className="avatar-circle"
          title={me?.username || me?.email || "Me"}
        >
          {meInitial}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            className={`rail-btn ${activeSection === "chats" ? "rail-btn-active" : "hover:bg-[var(--app-bg)]"}`}
            title="Chats"
            onClick={() => onSectionChange?.("chats")}
          >
            <FiMessageSquare className="text-xl" />
          </button>
          <button
            type="button"
            className="rail-btn hover:bg-[var(--app-bg)]"
            title="Contacts"
            onClick={() => onSectionChange?.("contacts")}
          >
            <FiUsers className="text-xl" />
          </button>
          <button
            type="button"
            className={`rail-btn ${activeSection === "settings" ? "rail-btn-active" : "hover:bg-[var(--app-bg)]"}`}
            title="Settings"
            onClick={() => onSectionChange?.("settings")}
          >
            <FiSettings className="text-xl" />
          </button>
        </div>

        <div className="mt-auto pb-2">
          <Logout onClick={onLogout} />
        </div>
      </div>

      {/* Conversations panel */}
      {showChats ? (
        <div className="flex-1 panel flex flex-col">
          <div className="panel-header">
            <div className="font-semibold">Chat</div>
            <div className="text-sm muted">{conversations?.length || 0}</div>
          </div>

          <Search
            onCreatedConversation={(conversation) => {
              onConversationsChanged?.().catch(() => {});
              onSelectConversation?.(conversation);
            }}
            setError={setError}
          />

          <div className="flex-1 overflow-y-auto">
            <User
              me={me}
              conversations={conversations}
              selectedConversation={selectedConversation}
              onSelectConversation={onSelectConversation}
              onlineUserIds={onlineUserIds}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Left;
