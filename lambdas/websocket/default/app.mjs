/**
 *  app.js -- default Handler
 * 
 * Handles inbound websocket messages from Twilio ConversationRelay.
 * 
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
const dynClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(dynClient);       

import { ApiGatewayManagementApiClient } from "@aws-sdk/client-apigatewaymanagementapi";

// Helper functions from Lambda Layers
import { invokeTranslate } from '/opt/invoke-translate.mjs'; // Translate text
import { buildDynExpressions }  from "/opt/cr-dynamodb-util.mjs"; // Build DynamoDB expressions
import { replyToWS } from '/opt/reply-to-ws.mjs'; // Reply to WebSocket API Gateway

import  { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
const snsClient = new SNSClient({ region: process.env.AWS_REGION });

export const lambdaHandler = async (event, context) => {    

    console.info("EVENT\n" + JSON.stringify(event, null, 2));    

    let connectionId = event.requestContext.connectionId; // unique to each party
    
    let ws_domain_name = event.requestContext.domainName; // shared by caller and callee
    let ws_stage = event.requestContext.stage; // shared by caller and callee
    let body = JSON.parse(event.body);

    // Instantiate WebSocket client to return text to Twilio
    // This client can be used in this lambda and/or passed
    // to other modules / layers.
    // This is the same for both caller and callee so that a message
    // received from either can post a message to the other using
    // the connectionId of the other!
    const ws_client = new ApiGatewayManagementApiClient( {
        endpoint: `https://${ws_domain_name}/${ws_stage}`
    });

    try {

        // Prompts contain text from converted speech
        if (body?.type === "prompt") {

            // Get the core details from this connection 
            const callConnection = await ddbDocClient.send( new GetCommand( { TableName: process.env.TABLE_NAME, Key: { pk: connectionId, sk: "connection" } } ));
            const party = callConnection.Item; // details for this party (caller or callee)

            console.info("party\n" + JSON.stringify(party, null, 2));    

            if (!party.translationActive) {
                // Translation is not yet active, return WAIT message
                let waitMessage = "Please wait while we configure translation services.";
                    
                // Translate the wait message if the source language is not English
                if (party.sourceVoiceCode !== "en" && party.sourceVoiceCode !== "en-US") {
                    let translateWaitObject = await invokeTranslate(waitMessage, "en", party.sourceLanguageCode);
                    waitMessage = translateWaitObject.TranslatedText;
                }
                await replyToWS(ws_client, connectionId, {   
                    type:"text",
                    token: waitMessage,
                    last: true
                });
                
            } else {
                
                /**
                 * Translation is active, so for each prompt:
                 * 1. translate the text from speech
                 * 2. post the translated text to the opposite party (to be spoken by ConversationRelay)
                 * 3. save the original and translated text to the database
                 */

                // 1. translate the text from speech => invokeTranslate(text, sourceLanguageCode, targetLanguageCode)                
                const translateObject = await invokeTranslate(
                    body.voicePrompt, 
                    party.sourceLanguageCode,
                    party.targetLanguageCode
                );

                console.info("translateObject\n" + JSON.stringify(translateObject, null, 2));    

                // 2. post the translated text to the opposite party
                /**
                 * The websocket connection is shared by both parties.
                 * We can post the translated text to the connectionId
                 * of the other party.
                 */ 
                await replyToWS(ws_client, party.targetConnectionId, {   
                    type:"text",
                    token: translateObject.TranslatedText, 
                    last: true
                }); 

                //3. save the original and translated text to the database
                /**
                 * This allows for the text in both languages to be saved and
                 * a complete record of the conversation.
                 */
                let itm = {
                    pk: party.parentConnectionId, // Use the parent connection ID (Caller) to save all text
                    sk: `spokenText::${Date.now().toString()}`,
                    pk1: "spokenText",
                    sk1: `${party.parentConnectionId}::${Date.now().toString()}`,
                    chat: {                
                        ts: Date.now(), // timestamp for sorting
                        whichParty: party.whichParty, // who spoke the words
                        partyConnectionId: party.pk, // connectionId of who spoke the words
                        original: body.voicePrompt, // what the caller said
                        originalLanguageCode: translateObject.SourceLanguageCode,
                        translated: translateObject.TranslatedText, // the result of the translation
                        translatedLanguageCode: translateObject.TargetLanguageCode,
                    },
                    expireAt: Math.floor(Date.now() / 1000) + 86400, // Delete Record after 1 day (can be changed/removed)
                };                  
                
                console.info("itm\n" + JSON.stringify(itm, null, 2));    

                await ddbDocClient.send(
                    new PutCommand({
                        TableName: process.env.TABLE_NAME,
                        Item: itm
                    })
                );                

            }

        } else if (body?.type === "setup") {
            
            /**
             * This is the initial setup event sent by the ConversationRelay server.
             * Create a new connection record in the database for this party (caller or callee).
             * This record maintains state for each party including record of 
             * the other party so each party can post translated text
             * to the other party.
             */

            // This is the Caller's connectionId for both parties
            let parentConnectionId = (body.customParameters?.parentConnectionId) ? body.customParameters.parentConnectionId : event.requestContext.connectionId;
            
            // Format the connection item from the setup event and passed in custom parameters
            let connectionItem = {
                ...body.customParameters, // This must be first so that the custom parameters can be overwritten (pk, sk, pk1, sk1)
                pk: event.requestContext.connectionId,
                sk: "connection",
                pk1: "connection",
                sk1: body.customParameters.SortKey,
                pk2: "callsid",
                sk2: body.callSid,
                callStatus: "connected", // connected, disconnected                
                parentConnectionId: parentConnectionId, // Will be the same for both parties but is Caller's connectionId                
                callSid: body.callSid,
                direction: body.direction,
                expireAt:  parseInt((Date.now() / 1000) + 86400)  // Expire "demo" session data automatically (can be removed)
            };
            
            // Save the connection item to the database (used in all subsequent messages)
            await ddbDocClient.send(
                new PutCommand({
                    TableName: process.env.TABLE_NAME,
                    Item: connectionItem
                })
            );

            if (body?.customParameters.whichParty === "caller") {
                
                /**
                 * Caller is the first party to connect. So we must trigger an
                 * event (SNS) to connect the caller and callee by making
                 * an outbound call to the callee (lambda function using
                 * Twilio SDK).
                 * 
                 */
                
                let snsResult = await snsClient.send(new PublishCommand({
                    Message: JSON.stringify(connectionItem),
                    TopicArn: process.env.TWILIO_INITIATE_CALL_TOPIC
                }));  

                //console.info("snsResult\n" + JSON.stringify(snsResult, null, 2));    

            } else if (body?.customParameters.whichParty === "callee") {        
                
                /**
                 * The second party, the callee, has connected. Update the connection
                 * record for the caller to indicate translation is active and include
                 * details for the callee to enable bi-directional translation.
                 */
                
                // Set the connectionId for the Caller
                // This passed by the sns message to the lambda function
                // and then in a custom parameter in ConversationRelay
                let callerConnectionId = body.customParameters.targetConnectionId;

                /** 
                 * Update the connection record for the caller to indicate 
                 * translation is active and add connection details for the callee.
                */ 
                let exps = await buildDynExpressions( 
                    { 
                        translationActive: true, 
                        targetConnectionId: event.requestContext.connectionId,
                        targetLanguageCode: body.customParameters.sourceLanguageCode,
                        targetLanguage: body.customParameters.sourceLanguage,
                        targetTranscriptionProvider: body.customParameters.sourceTranscriptionProvider,
                        targetTtsProvider: body.customParameters.sourceTtsProvider,
                        targetVoice: body.customParameters.sourceVoice,                        
                        targetCallSid: body.callSid
                    });        

                console.log("exps ==> ", exps);

                await ddbDocClient.send( 
                    new UpdateCommand(
                        { 
                            TableName: process.env.TABLE_NAME, Key: { pk: callerConnectionId, sk: "connection" }, 
                            UpdateExpression: exps.updateExpression,
                            ExpressionAttributeNames: exps.expressionAttributeNames,        
                            ExpressionAttributeValues: exps.expressionAttributeValues,
                            ReturnValues: "ALL_NEW",                            
                        } 
                    ) 
                );                   

                // Let the Callee know that the session has begun (post text to websocket)
                let calleeConnectionMessage = "The translation session has begun.";

                // If the callee language is NOT english, translate the welcome message
                if (body.customParameters.sourceLanguageCode !== "en" && body.customParameters.sourceLanguageCode !== "en-US") {
                    let translateCalleeConnectedObject = await invokeTranslate(calleeConnectionMessage, "en", body.customParameters.sourceLanguageCode);
                    calleeConnectionMessage = translateCalleeConnectedObject.TranslatedText;
                }

                await replyToWS(ws_client, connectionId, {   
                    type:"text",
                    token: calleeConnectionMessage,
                    last: true
                });                    

                // Let the Caller know that the session has begun (post text to websocket)
                let callerConnectedMessage = "The translation session has begun.";

                // If the caller language is NOT english, translate the welcome message
                if (body.customParameters.targetLanguageCode !== "en" && body.customParameters.targetLanguageCode !== "en-US") {
                    let translateCallerConnectedObject = await invokeTranslate(callerConnectedMessage, "en", body.customParameters.targetLanguageCode);
                    callerConnectedMessage = translateCallerConnectedObject.TranslatedText;
                }

                await replyToWS(ws_client, callerConnectionId, {   
                    type:"text",
                    token: callerConnectedMessage,
                    last: true
                });                

            } else {

                throw new Error("Invalid whichParty value in setup event.");
                
            }

        } else if (body?.type === "interrupt") {

            /**
             * "interrupt" event sent by the ConversationRelay server when the user speaks 
             * before the text-to-speech has completed.
             * 
             * {
             *  "type" : "interrupt",
             *  "utteranceUntilInterrupt": "Life is a complex set of",
             *  "durationUntilInterruptMs": "460"
             * }
             * 
             */
    
            // "interrupt" not handled in this implementation            

        } else if (body?.type === "dtmf") {                        

            /** 
             * {
             *  "type": "dtmf",
             * "digit": "1"
             * } 
            */
            
            // "dtmf" not handled in this implementation

        } else if (body?.type === "error") {                        

            /**
             * {
             *  "type": "error",
             *  "description": "Invalid message received: { \"foo\" : \"bar\" }"
             * }
            */
            
            // "error" not handled in this implementation

        }
    
        return { statusCode: 200, body: 'Completed.' };

    } catch (error) {
        
        console.log("Default Route app.js generated an error => ", error);
        
        return { statusCode: 500, body: 'Default app.js generated an error: ' + JSON.stringify(error) };

    }  

};