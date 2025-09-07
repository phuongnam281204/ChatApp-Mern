import React from 'react'
import Left from './home/Leftpart/Left'
import Right from './home/Rightpart/Right'

const App = () => {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left Sidebar - Chat List */}
      <div className="flex-none">
        <Left />
      </div>
      
      {/* Right Main Chat Area */}
      <div className="flex-1">
        <Right />
      </div>
    </div>
  )
}

export default App