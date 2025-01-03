/**
 *  onconnect
 * 
 * Lambda function called when a WebSocket connection has ended.
 *   
 */


export const lambdaHandler = async (event, context) => {    

    console.info("EVENT ==>\n" + JSON.stringify(event, null, 2));    

    // "onconnect" not handled in this implementation 

    return { statusCode: 200, body: 'Success.' };        

};