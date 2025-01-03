/**
 * apartmentSearchUseCase.js
 * 
 * This is a DynamoDB JSON file used to load data into the DynamoDB instance.
 * 
 * The command to load this item is in the "command-..." file in
 * the parent directory of this stack.
 * 
 */

let userProfile = 
{
  "pk": {
    "S": "agent"
  },
  "sk": {
    "S": "profile"
  },
  "pk1": {
    "S": "profile"
  },
  "sk1": {
    "S": "agent"
  },
  "name": {
    "S": "Sandra"
  },
  "sourceLanguageCode": {
    "S": "en"
  },
  "sourceLanguage": {
    "S": "en-US"
  },
  "sourceTranscriptionProvider": {
    "S": "Deepgram"
  },
  "sourceTtsProvider": {
    "S": "Amazon"
  },
  "sourceVoice": {
    "S": "Matthew-Generative"
  }    
};

console.log(JSON.stringify(userProfile));