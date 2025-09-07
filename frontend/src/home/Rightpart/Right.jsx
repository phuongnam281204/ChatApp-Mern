import React from 'react'

const Right = () => {
  return (
    <div className="flex-1 h-full bg-white flex flex-col">
      {/* Chat Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white font-medium">JD</span>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">John Doe</h3>
            <p className="text-sm text-green-500">Online</p>
          </div>
        </div>
      </div>
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <div className="space-y-4">
          {/* Received Message */}
          <div className="flex">
            <div className="bg-white p-3 rounded-lg shadow-sm max-w-xs">
              <p className="text-gray-800">Hey! How are you doing today?</p>
              <span className="text-xs text-gray-500 mt-1 block">10:30 AM</span>
            </div>
          </div>
          
          {/* Sent Message */}
          <div className="flex justify-end">
            <div className="bg-blue-500 text-white p-3 rounded-lg shadow-sm max-w-xs">
              <p>I'm doing great! Thanks for asking. How about you?</p>
              <span className="text-xs text-blue-100 mt-1 block">10:32 AM</span>
            </div>
          </div>
          
          {/* Received Message */}
          <div className="flex">
            <div className="bg-white p-3 rounded-lg shadow-sm max-w-xs">
              <p className="text-gray-800">That's awesome! I'm doing well too. Working on a new project.</p>
              <span className="text-xs text-gray-500 mt-1 block">10:35 AM</span>
            </div>
          </div>
          
          {/* Sent Message */}
          <div className="flex justify-end">
            <div className="bg-blue-500 text-white p-3 rounded-lg shadow-sm max-w-xs">
              <p>Nice! What kind of project are you working on?</p>
              <span className="text-xs text-blue-100 mt-1 block">10:37 AM</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Message Input */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="flex space-x-2">
          <input 
            type="text" 
            placeholder="Type a message..." 
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

export default Right