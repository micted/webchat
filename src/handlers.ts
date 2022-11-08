import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyResult } from "aws-lambda";
import AWS, { AWSError } from "aws-sdk";


type Action = "$connect" | "$disconnect" | "getMessages" | "sendMessages" | "getClients";
type Client = {
  connectionId: string;
  nickname: string;
}


const docClinet  = new AWS.DynamoDB.DocumentClient();
const CLIENT_TABLE_NAME = "Clients";
const apiGw = new AWS.ApiGatewayManagementApi({
  endpoint: process.env["WSSAPIGATEWAYENDPOINT"]
})

const responseOK = {

    statusCode: 200,
    body: "",

}
  

export const handle = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const routeKey = event.requestContext.routeKey as Action;
  const connectionId = event.requestContext.connectionId as string;


  switch(routeKey) {

    case "$connect":
      return handleConnect(connectionId,event.queryStringParameters);

    case "$disconnect":
      return handleDisconnect(connectionId);

    case "getClients":
      return handleGetClients(connectionId);

    
    default:
      return {
        statusCode: 500,
        body: JSON.stringify(
          {
            message: "Go Serverless v1.0! Your function executed successfully!",
            input: event,
          },
          null,
          2,
        ),
      };
      
  }
  
};


const handleConnect = async(connectionId:string, queryParams: APIGatewayProxyEventQueryStringParameters | null,): Promise<APIGatewayProxyResult> => {
  if (!queryParams || !queryParams['nickname']) {
    return {
      statusCode: 403,
      body: "",

    };

    }

    await docClinet.put({
      TableName: CLIENT_TABLE_NAME,
      Item: {
        connectionId,
        nickname: queryParams["nickname"],
      },

    }).promise();

  await notifyClients(connectionId);
    return responseOK

  
};


const handleDisconnect = async(connectionId:string): Promise<APIGatewayProxyResult> => {
 
    await docClinet.delete({
      TableName: CLIENT_TABLE_NAME,
      Key: {
        connectionId,

      }
      

    }).promise();

    await notifyClients(connectionId);
    return responseOK

  
};
const getAllClients = async():Promise<Client[]> => {
  const output = await docClinet.scan({
    TableName: CLIENT_TABLE_NAME,
  
  }).promise();

  const clients = output.Items || [];

  return clients as Client[];
}
// exclude connection ID needed since we dont want to notify the one who initiated the specfic action( it can be connect or disconnect)
const notifyClients = async(connectionIdToExclude:string)=>{

  const clients = await getAllClients();

  await Promise.all(
    clients.filter((client: { connectionId: string; })=> client.connectionId !== connectionIdToExclude)
    .map(async (client: { connectionId: string; })=>{

    await postToConnection(client.connectionId, JSON.stringify(clients));

  }),
  
  );

};

// function for post connection 
const postToConnection = async(connectionId:string, data:string) => {

  try {

    await apiGw.postToConnection({
      ConnectionId: connectionId,
      Data: data,

    }).promise();

  } catch (e) {
    if ((e as AWSError).statusCode !== 410) { // check if whether the client is gone or not...
    //since we worry about real time activity gone is not supported so throw error
    throw(e);
  }
  

  // if the client is gone for some reason according to status code 410 we delete since we worry about real time data

  await docClinet.delete({
    TableName: CLIENT_TABLE_NAME,
    Key: {
      connectionId,

    }
    

  }).promise();

  


}
};




const handleGetClients = async(connectionId:string): Promise<APIGatewayProxyResult> => {
 
  const clients = await getAllClients();
   // sends message to connected client

  await postToConnection(connectionId, JSON.stringify(clients));

  return responseOK
      


};


