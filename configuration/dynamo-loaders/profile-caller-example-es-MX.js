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
    "S": "+19494337060"
  },
  "sk": {
    "S": "profile"
  },
  "pk1": {
    "S": "profile"
  },
  "sk1": {
    "S": "+19494337060"
  },
  "name": {
    "S": "Dan"
  },
  "sourceLanguageCode": {
    "S": "es-MX"
  },
  "sourceLanguage": {
    "S": "es-MX"
  },
  "sourceTranscriptionProvider": {
    "S": "Deepgram"
  },
  "sourceTtsProvider": {
    "S": "Amazon"
  },
  "sourceVoice": {
    "S": "Lupe-Generative"
  }  
};

console.log(JSON.stringify(userProfile));