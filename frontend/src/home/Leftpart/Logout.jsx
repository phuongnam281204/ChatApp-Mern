import React from 'react'

const Logout = () => {
  return (
    <>
      <hr />
      <div className=" h-[10vh] bg-transparent">
        <div>
          <BiLogOutCircle
            className="text-5xl text-white hover:bg-slate-700 duration-300 cursor-pointer rounded-full p-2 ml-2 mt-1"
          />
        </div>
      </div>
    </>
  )
}

export default Logout