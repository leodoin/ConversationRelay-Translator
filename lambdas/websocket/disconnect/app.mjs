/**
 *  disconnect
 * 
 * Lambda function called when a websocket connection has ended.
 * 
 * Since there are two separate calls in this solution, if one
 * call hangs up we need to notify the other party AND end
 * the other call. Your solution may choose to transfer the
 * call instead of end it.
 * 
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
const dynClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(dynClient);       

import { ApiGatewayManagementApiClient } from "@aws-sdk/client-apigatewaymanagementapi";

// Helper functions from Lambda Layers
import { invokeTranslate } from '/opt/invoke-translate.mjs';
import { buildDynExpressions }  from "/opt/cr-dynamodb-util.mjs";
import { replyToWS } from '/opt/reply-to-ws.mjs';

import twilio from 'twilio';
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = twilio(accountSid, authToken);

export const lambdaHandler = async (event, context) => {    

    console.info("EVENT\n" + JSON.stringify(event, null, 2));    

    /**
     * 1) Get the connection object using the connectionId
     * 2) Get the other party's connection object using the targetConnectionId
     * 3) Update the connection object to reflect that the connection has ended
     * 4) Check if the other party is still connected (connectionStatus == "connected")
     * 5) If the other party is still connected, 
     *      (A) update connection object, 
     *      (B) send text that the other party has ended the call, and then 
     *      (C) use Twilio SDK to end the call.      
     */

    let connectionId = event.requestContext.connectionId; // unique to each party (this party disconnected)

    try {
                
        // 1) Get the connection object using the connectionId
        const callConnection = await ddbDocClient.send( new GetCommand( { TableName: process.env.TABLE_NAME, Key: { pk: connectionId, sk: "connection" } } ));
        const party = callConnection.Item; // details for this party (caller or callee)

        // 2) Get the other party's connection object using the targetConnectionId
        const otherCallConnection = await ddbDocClient.send( new GetCommand( { TableName: process.env.TABLE_NAME, Key: { pk: party.targetConnectionId, sk: "connection" } } ));
        const otherParty = otherCallConnection.Item; // details for the other party (callee or caller)

        // 3) Update the connection object to reflect that the connection has ended
        let exps = await buildDynExpressions( { 
            callStatus: "disconnected" 
        });        

        await ddbDocClient.send( 
            new UpdateCommand(
                { 
                    TableName: process.env.TABLE_NAME, Key: { pk: connectionId, sk: "connection" }, 
                    UpdateExpression: exps.updateExpression,
                    ExpressionAttributeNames: exps.expressionAttributeNames,        
                    ExpressionAttributeValues: exps.expressionAttributeValues,
                    ReturnValues: "ALL_NEW",                            
                } 
            ) 
        );         

        // 4) Check if the other party is still connected (connectionStatus == "connected")
        if (otherParty.callStatus === "connected") {
            /*
            * 5) If the other party is still connected, 
            *      (A) update connection object, 
            *      (B) send text that the other party has ended the call, and then 
            *      (C) use Twilio SDK to end the call.  
            */

            // (A) Update the connection object for the other party (uses same exps from above)
            await ddbDocClient.send( 
                new UpdateCommand(
                    { 
                        TableName: process.env.TABLE_NAME, Key: { pk: otherParty.pk, sk: "connection" }, 
                        UpdateExpression: exps.updateExpression,
                        ExpressionAttributeNames: exps.expressionAttributeNames,        
                        ExpressionAttributeValues: exps.expressionAttributeValues,
                        ReturnValues: "ALL_NEW",                            
                    } 
                ) 
            );                          

            // (B) Send text that the other party has ended the call
            let disconnectMessage = "The other person has ended the call.";
            if (otherParty.sourceLanguageCode !== "en" && otherParty.sourceLanguageCode !== "en-US") {
                let translateDisconnectMessageObject = await invokeTranslate(disconnectMessage, "en", otherParty.sourceLanguageCode);
                disconnectMessage = translateDisconnectMessageObject.TranslatedText;
            }            
            
            // Instantiate WebSocket client to return text to Twilio            
            let ws_domain_name = event.requestContext.domainName; // shared by caller and callee
            let ws_stage = event.requestContext.stage; // shared by caller and callee            
            const ws_client = new ApiGatewayManagementApiClient( {
                endpoint: `https://${ws_domain_name}/${ws_stage}`
            });            
            await replyToWS(ws_client, otherParty.pk, {   
                type:"text",
                token: disconnectMessage,
                last: true
            });                    
            // (C) Use Twilio SDK to end the call
            /**
             * Note: Step B could be handled with TwiML as well.
             * Send a <Say> verb and then a <Hangup>
             */
            const delay = ms => new Promise(res => setTimeout(res, ms));
            await delay(2000); // wait 2 seconds before ending the call to allow time for message to be spoken

            const endCallResponse = await twilioClient
                .calls(otherParty.callSid)
                .update({ status: 'completed' });

            console.info("endCallResponse\n" + JSON.stringify(endCallResponse, null, 2));                  
        }

        return { statusCode: 200, body: 'Disconnected.' };

    } catch (error) {
        
        console.log("Error failed to disconnect => ", error);
        
        return { statusCode: 500, body: 'Failed to disconnect: ' + JSON.stringify(error) };

    }    

};