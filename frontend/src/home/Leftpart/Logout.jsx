import React from "react";
import { BiLogOutCircle } from "react-icons/bi";

const Logout = ({ onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rail-btn hover:bg-[var(--app-bg)]"
      title="Logout"
    >
      <BiLogOutCircle className="text-2xl" />
    </button>
  );
};

export default Logout;
