import React from 'react'
import Search from './Search'
import User from './User'

const Left = () => {
  return (
    <div className="w-1/3 bg-black text-gray-300 flex flex-col">
      <Search />
      <div className="flex-1 overflow-y-auto">
        <User />
      </div>
    </div>
  );
}

export default Left