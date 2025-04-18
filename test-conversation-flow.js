const WebSocket = require('ws');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Configuration
const config = {
  // WebSocket endpoint URL from the CloudFormation output
  wsUrl: 'wss://108irp36o9.execute-api.eu-north-1.amazonaws.com/prod',
  // Test conversation session details
  session: {
    sessionId: uuidv4(),
    callerId: '+15551234567',
    calleeId: '+15559876543',
    callerLanguage: 'en',
    calleeLanguage: 'es'
  },
  // Test messages
  messages: [
    "Hello, I'd like to order a pizza",
    "I want a large pepperoni pizza with extra cheese",
    "Yes, please add some garlic bread as well",
    "Can I pay with credit card on delivery?",
    "Great, my address is 123 Main Street"
  ]
};

// Create and store the connection
let socket;

// Connect to the WebSocket
function connect() {
  return new Promise((resolve, reject) => {
    socket = new WebSocket(config.wsUrl);
    
    socket.on('open', () => {
      console.log('WebSocket connection established');
      resolve(socket);
    });
    
    socket.on('error', (error) => {
      console.error('WebSocket connection error:', error);
      reject(error);
    });
    
    socket.on('close', () => {
      console.log('WebSocket connection closed');
    });
    
    socket.on('message', (data) => {
      const message = JSON.parse(data);
      console.log('Received message:', message);
      
      // Process different types of messages here
      if (message.action === 'translationComplete') {
        console.log(`Translation: ${message.originalText} => ${message.translatedText}`);
      }
    });
  });
}

// Initialize a session
function initSession() {
  const message = {
    action: 'initSession',
    sessionId: config.session.sessionId,
    callerId: config.session.callerId,
    callerLanguage: config.session.callerLanguage,
    calleeId: config.session.calleeId,
    calleeLanguage: config.session.calleeLanguage
  };
  
  console.log('Initializing session:', message);
  socket.send(JSON.stringify(message));
}

// Send a test message
function sendMessage(text, sender = 'caller') {
  const message = {
    action: 'message',
    sessionId: config.session.sessionId,
    sender: sender,
    text: text
  };
  
  console.log(`Sending ${sender} message:`, text);
  socket.send(JSON.stringify(message));
}

// Run the test
async function runTest() {
  try {
    // Connect to WebSocket
    await connect();
    
    // Initialize session
    initSession();
    
    // Wait for session initialization to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Send test messages with delays between them
    for (let i = 0; i < config.messages.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      sendMessage(config.messages[i]);
    }
    
    // Wait for final translations to complete
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Close the connection
    socket.close();
    console.log('Test completed successfully');
    
  } catch (error) {
    console.error('Test failed:', error);
    if (socket) socket.close();
  }
}

// Run the test
runTest(); 