/**
 * profile-agent-callee-example.js
 * 
 * This is a DynamoDB JSON file used to load data into the DynamoDB instance.
 * 
 * Each caller needs to have this "profile" item in the DynamoDB table so
 * ConverationRelay can properly configure the language and voice settings for
 * both caller and callee.
 * 
 * Descriptions of the fields:
 
pk: Your phone number ("+14155551212")
sk: "profile" // leave as "profile"
calleeDetails: true|false // Use the callee details here as opposed to defaults
calleeLanguage: "es-MX", // language code used by ConversationRelay (agent)
calleeLanguageFriendly: "Spanish - Mexico", // Display language (optional)
calleeLanguageCode: "es-MX", // language code use by AWS Translate (agent)
calleeNumber: "+19495553434", // the number you want connect to for second party!
calleeTranscriptionProvider: "Deepgram" // Transacription Provider for second party
calleeTtsProvider: "Amazon" // TTS Provider for second party
calleeVoice: "Lupe-Generative" // Voice to use for second party
name: ("Dan") // Your name
pk1: ("profile") // leave as "profile"
sk1: Your phone number ("+14155551212")
sourceLanguage: ("en-US") // Language of caller used by ConversationRelay
sourceLanguageCode: ("en") // Language of caller used by AWS Translate
sourceLanguageFriendly: ("English - United States") // Display language (optional)
sourceTranscriptionProvider: ("Deepgram") // Transacription Provider for caller
sourceTtsProvider: ("Amazon") // TTS Provider for caller
sourceVoice: ("Matthew-Generative") // Voice to use for the caller

  * Edit the profile below to match your needs. You can change the languages, and more, of 
  * the caller and callee by editing this item in the DynamoDB table.
  * 
  * ConversationRelay Voices and Languages: https://www.twilio.com/docs/voice/twiml/connect/conversationrelay
  * 
  * AWS Translate Languages: https://docs.aws.amazon.com/translate/latest/dg/what-is-languages.html
  * 
  * In this sample profile, the caller is speaking english and the callee is speaking spanish.
  * 
 */

let userProfile = 
{
  "pk": {
    "S": "+14155551212"
  },
  "sk": {
    "S": "profile"
  },
  "calleeDetails": {
    "BOOL": true
  },
  "calleeLanguage": {
    "S": "es-MX"
  },
  "calleeLanguageCode": {
    "S": "es-MX"
  },
  "calleeLanguageFriendly": {
    "S": "Spanish - Mexico"
  },
  "calleeNumber": {
    "S": "+19495553434"
  },
  "calleeTranscriptionProvider": {
    "S": "Deepgram"
  },
  "calleeTtsProvider": {
    "S": "Amazon"
  },
  "calleeVoice": {
    "S": "Lupe-Generative"
  },
  "name": {
    "S": "Dan"
  },
  "pk1": {
    "S": "profile"
  },
  "sk1": {
    "S": "+14155551212"
  },
  "sourceLanguage": {
    "S": "en-US"
  },
  "sourceLanguageCode": {
    "S": "en"
  },
  "sourceLanguageFriendly": {
    "S": "English - United States"
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