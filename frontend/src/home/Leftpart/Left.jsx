import React from 'react'

const Left = () => {
  return (
    <div className="w-80 h-full bg-white border-r border-gray-300 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800">Messages</h2>
      </div>
      
      {/* Search Bar */}
      <div className="p-4">
        <input 
          type="text" 
          placeholder="Search conversations..." 
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      
      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1">
          {/* Sample Chat Items */}
          <div className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white font-medium">JD</span>
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">John Doe</h3>
                <p className="text-sm text-gray-500 truncate">Hey, how are you doing?</p>
              </div>
              <div className="text-xs text-gray-400">2m</div>
            </div>
          </div>
          
          <div className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white font-medium">AM</span>
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">Alice Miller</h3>
                <p className="text-sm text-gray-500 truncate">Thanks for the help!</p>
              </div>
              <div className="text-xs text-gray-400">1h</div>
            </div>
          </div>
          
          <div className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                <span className="text-white font-medium">BS</span>
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">Bob Smith</h3>
                <p className="text-sm text-gray-500 truncate">See you tomorrow!</p>
              </div>
              <div className="text-xs text-gray-400">3h</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Left