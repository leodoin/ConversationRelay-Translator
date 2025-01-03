/**
 *  twiml/outbound/initiate-call/app.mjs
 * 
 * This lambda is triggered by an SNS message when a caller needs
 * to be connected to an agent (Callee) using translation services. 
 * 
 * The agent is selected by an API call or some process, and then the
 * ConversationRelay setting is established (Twilio SDK) and then the 
 * Caller and Callee are connected and able to communicate 
 * regardless of language.
 * 
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
const dynClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(dynClient);

import twilio from 'twilio';
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = twilio(accountSid, authToken);

// Helper functions from Lambda Layers
import { invokeTranslate } from '/opt/invoke-translate.mjs';

export const lambdaHandler = async (event, context) => {   

  let snsPayload = JSON.parse(event.Records[0].Sns.Message);  

  console.info("EVENT\n" + JSON.stringify(event, null, 2));    
  console.info("Message\n" + JSON.stringify(snsPayload, null, 2));    

  /**
   * GetAgentContext (Callee)
   * 
   * API call to get the agent available to take the call and their
   * details. This could be a simple DynamoDB query or a more complex call to
   * a queueing / routing system.
   */
        const agent = await ddbDocClient.send( new GetCommand( { TableName: process.env.TABLE_NAME, Key: { pk: "agent", sk: "profile" } } ));
        let agentContext = {};
        if (agent.Item) {
          agentContext = agent.Item;
        } else {
          agentContext = {
              name: "Sandra",
              sourceLanguageCode: "es-MX", // ("es-MX") What AWS Translate uses to translate
              sourceLanguage: "es-MX", // ("es-MX") What ConversationRelay uses      
              sourceTranscriptionProvider: "Deepgram", // ("Deepgram") Provider for transcription
              sourceTtsProvider: "Amazon", // ("Amazon") Provider for Text-To-Speech
              sourceVoice: "Lupe-Generative", // ("Lupe-Generative") Voice for TTS (depends on ttsProvider)
          };
        }

  // Use the agent phone number if it exists, otherwise use the default 
  let calleeNumber = (agentContext?.phone_number) ? agentContext.phone_number : process.env.AGENT_PHONE_NUMBER;
  
  // Call the agent from the Twilio number that the Caller called, or use a default
  let callFrom = (snsPayload.To) ? snsPayload.To : process.env.TWILIO_DEFAULT_FROM;

  let customParams = {
    ...agentContext, // Add all properties from agentContext
    To: calleeNumber,
    From: snsPayload.To, // Number that the Caller called
    SortKey: snsPayload.To,            
    AccountSid: snsPayload.AccountSid,
    parentConnectionId: snsPayload.pk, // This is the Caller's connection ID, all text saved using this key
    translationActive: true,
    whichParty: "callee",    
    callerPhone: snsPayload.From, // Caller Phone Number
    targetConnectionId: snsPayload.pk, // Caller connection ID
    targetLanguageCode: snsPayload.sourceLanguageCode, // Caller
    targetLanguage: snsPayload.sourceLanguage, // opposite party (Caller)
    targetTranscriptionProvider: snsPayload.sourceTranscriptionProvider, // opposite party (Caller)
    targetTtsProvider: snsPayload.sourceTtsProvider, // opposite party (Caller)
    targetVoice: snsPayload.sourceVoice, // opposite party (Caller)
    targetCallSid: snsPayload.CallSid // Caller
};

/**
 * Custom parameters are passed to the ConversationRelay TwiML tag
 * and then included in the "setup"
 */
  let customParamsString = "";
  for (const [key, value] of Object.entries(customParams)) {
      customParamsString += `      <Parameter name="${key}" value="${value}" />
  `;
      console.log(`${key}: ${value}`);
  }       
  
  let welcomeMessage = "Initiating translation session.";
                    
  if (agentContext.sourceLanguageCode !== "en" && agentContext.sourceLanguageCode !== "en-US") {
      let translateWaitObject = await invokeTranslate(welcomeMessage, "en", agentContext.sourceLanguageCode);
      welcomeMessage = translateWaitObject.TranslatedText;
  }

  let conversationRelayParams = {
    welcomeGreeting: welcomeMessage,
    dtmfDetection: false,
    interruptByDtmf: false,
    language: agentContext.sourceLanguage,
    transcriptionProvider: agentContext.sourceTranscriptionProvider,
    ttsProvider: agentContext.sourceTtsProvider,
    voice: agentContext.sourceVoice,    
  };  
  
  /** 
   * Pull out params for attributes for ConversationRelay TwiML tag ==> 
   * Could be dynamic for language, tts, stt...
  */
  let conversationRelayParamsString = "";
  for (const [key, value] of Object.entries(conversationRelayParams)) {
      conversationRelayParamsString += `${key}="${value}" `;
      console.log(`${key}: ${value}`);
  }

  let twiml = `<Response>
  <Connect>
    <ConversationRelay url="${process.env.WS_URL}" ${conversationRelayParamsString}>
      ${customParamsString}
    </ConversationRelay>
  </Connect>
</Response>`;

  // Use the Twilio SDK to initiate the call
  const callResponse = await twilioClient.calls.create({    
    from: callFrom,
    to: calleeNumber,
    twiml: twiml,
  });
  
  console.info("callResponse\n" + JSON.stringify(callResponse, null, 2));    

  return true;

};