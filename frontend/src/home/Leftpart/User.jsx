import React from "react";

const User = () => {
  return (
    <div>
      <h1 className="px-8 py-2 text-white font-semibold bg-slate-800 rounded-md">
        Message
      </h1>
      <div className="flex space-x-4 px-4 py-3 items-center">
        <div className="avatar avatar-online">
          <div className="w-24 rounded-full">
            <img src="https://img.daisyui.com/images/profile/demo/gordon@192.webp" />
          </div>
        </div>
        <div>
          <h1 className="text-white">Gordon</h1>
          <span className="text-gray-400">Online</span>
        </div>
      </div>
    </div>
  );
};

export default User;
