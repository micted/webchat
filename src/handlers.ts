import {
  APIGatewayProxyEvent,
  APIGatewayProxyEventQueryStringParameters,
  APIGatewayProxyResult,
} from "aws-lambda";
import AWS, { APIGateway, AWSError } from "aws-sdk";
import { DocumentClient, Key } from "aws-sdk/clients/dynamodb";
import { v4 } from "uuid";


class HandlerError extends Error {}

type Action = "$connect" | "$disconnect" | "getMessages" | "sendMessage" | "getClients";
type Client = {
  connectionId: string;
  nickname: string;
}

type SendMessage = {

  message: string;
  recipentNickname: string;
}

type  GetMessage = {
  // the sender name
  targetNickname: string;
  recipentNickname: string;
  limit: number; // pagination
  startKey: Key | undefined;
};



const docClient = new AWS.DynamoDB.DocumentClient();
const CLIENT_TABLE_NAME = "Clients";
const MESSAGE_TABLE_NAME ="Messages"
const apiGw = new AWS.ApiGatewayManagementApi({
  endpoint: process.env["WSSAPIGATEWAYENDPOINT"]
})

const responseOK = {

    statusCode: 200,
    body: "",

}

const responseForbidden = {

  statusCode: 403,
  body: "",
}
  

export const handle = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const routeKey = event.requestContext.routeKey as Action;
  const connectionId = event.requestContext.connectionId as string;

try {
  switch(routeKey) {

    case "$connect":
      return handleConnect(connectionId,event.queryStringParameters);

    case "$disconnect":
      return handleDisconnect(connectionId);

    case "getClients":
      return handleGetClients(connectionId);
    
    case "sendMessage":
        return handleSendMessage(
          await getClient(connectionId),
          parseSendMessageBody(event.body),
        );
    case "getMessages":
        return handleGetMessages(
          await getClient(connectionId),
          parseGetMessageBody(event.body),
        );
      default:
        return responseForbidden;
    }
  } catch (e) {
  
    if (e instanceof HandlerError) {
      await postToConnection(connectionId,JSON.stringify({type: "error", message:e.message}));

      return responseOK;

    }

    throw e;

  }

};


const parseSendMessageBody = (body:string |null):SendMessage => {

  const sendMessage = JSON.parse(body || "{}") as SendMessage
  if (
    !sendMessage ||
    typeof sendMessage.message !== "string" ||
    typeof sendMessage.recipentNickname !== "string"    
    ) {
         throw new HandlerError("incorrect sendmessage format")
    }
  return sendMessage;

}

const parseGetMessageBody = (body:string | null):GetMessage  => {

  const getMessage = JSON.parse(body || "{}") as GetMessage
  if (
    !getMessage ||
    typeof getMessage.targetNickname !== "string" ||
    typeof getMessage.limit !== "number"    
    ) {
         throw new HandlerError("incorrect getmessage format")
    }
  return getMessage;

}


const handleConnect = async(connectionId:string, queryParams: APIGatewayProxyEventQueryStringParameters | null,): 
Promise<APIGatewayProxyResult> => {
  if (!queryParams || !queryParams["nickname"]) {
    return {
      statusCode: 403,
      body: "",

    };   

    }

// DUPLICATE NICKNAME RESOLVE
// edge case where client with the same nickname try to connect
// since nickname is used as secondary index



// for that nickname if count > 0 is that it means the connection exist

const existingConnectionId = await getConnectionIdByNickname(

  queryParams["nickname"],

);

if (
  existingConnectionId &&
  (await postToConnection(
    existingConnectionId,
    JSON.stringify({ type: "ping" }),
  ))
) {
  return responseForbidden;
}

  // otherwise the client is gone then we allow and add the client
  await docClient.put({
    TableName: CLIENT_TABLE_NAME,
    Item: {
      connectionId,
      nickname: queryParams["nickname"],
    },

  }).promise();

await notifyClients(connectionId); 
return responseOK
  
};

const getConnectionIdByNickname = async (
  nickname: string,
): Promise<string | undefined> => {
  const output = await docClient
    .query({
      TableName: CLIENT_TABLE_NAME,
      IndexName: "NicknameIndex",
      KeyConditionExpression: "#nickname = :nickname",
      ExpressionAttributeNames: {
        "#nickname": "nickname",
      },
      ExpressionAttributeValues: {
        ":nickname": nickname,
      },
    })
    .promise();

  return output.Items && output.Items.length > 0
    ? output.Items[0].connectionId
    : undefined;
};



const handleDisconnect = async(connectionId:string): Promise<APIGatewayProxyResult> => {
 
    await docClient.delete({
      TableName: CLIENT_TABLE_NAME,
      Key: {
        connectionId,

      }
      

    }).promise();

    await notifyClients(connectionId);
    return responseOK

  
};


const getAllClients = async():Promise<Client[]> => {
  const output = await docClient.scan({
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

    await postToConnection(client.connectionId, createClientMessage(clients));

  }),
  
  );

};

// function for post connection and it also act as flag
const postToConnection = async(connectionId:string, data:string): Promise<boolean> => {

  try {

    await apiGw.postToConnection({
      ConnectionId: connectionId,
      Data: data,

    }).promise();
    return true;

  } catch (e) {
    if ((e as AWSError).statusCode !== 410) { // check if whether the client is gone or not...
    //since we worry about real time activity gone is not supported so throw error
    throw(e);

  }
  

  // if the client is gone for some reason according to status code 410 we delete since we worry about real time data

  await docClient.delete({
    TableName: CLIENT_TABLE_NAME,
    Key: {
      connectionId,

    }
    

  }).promise();

  return false


}
};




const handleGetClients = async(connectionId:string): Promise<APIGatewayProxyResult> => {
 
  const clients = await getAllClients();

   // sends message to connected client
   // in contrary get message provides detail info about the connection
  await postToConnection(connectionId, createClientMessage(clients));

  return responseOK
      


};

const createClientMessage = (clients:Client[]):string => 

  JSON.stringify({type:"clients", value: {clients}} )


const handleSendMessage = async (client: Client, body: SendMessage) => {
    const nicknameToNickname = getnicknameToNickname([
      client.nickname,
      body.recipentNickname,
    ]);
  
    await docClient
      .put({
        TableName: MESSAGE_TABLE_NAME,
        Item: {
          messageId: v4(),
          nicknameToNickname,
          message: body.message,
          sender: client.nickname,
          createdAt: new Date().getTime(), // get time in ms
        },
      })
      .promise();
      
    const recipientConnectionId = await getConnectionIdByNickname(
      body.recipentNickname,
    );
  
    if (recipientConnectionId) {
      await apiGw
        .postToConnection({
          ConnectionId: recipientConnectionId,
          Data: JSON.stringify({
            type: "message",
            value: {
              sender: client.nickname,
              message: body.message,
            },
          }),
        })
        .promise();
    }
  
    return responseOK;
  };
const getnicknameToNickname = (nicknames: string[]): string => nicknames.sort().join("#")

// retrieve client 
const getClient = async(connectionId:string)=> {
  const output = await docClient.get({
    TableName: CLIENT_TABLE_NAME,
    Key: {
      connectionId,
    }
  }).promise();

  return output.Item as Client; 
}

const handleGetMessages = async (client: Client, body: GetMessage) => {
  const output = await docClient
    .query({
      TableName: MESSAGE_TABLE_NAME,
      IndexName: "NicknameToNicknameIndex",
      KeyConditionExpression: "#nicknameToNickname = :nicknameToNickname",
      ExpressionAttributeNames: {
        "#nicknameToNickname": "nicknameToNickname",
      },
      ExpressionAttributeValues: {
        ":nicknameToNickname": getnicknameToNickname([
          client.nickname,
          body.targetNickname,
        ]),
      },
      Limit: body.limit,
      ExclusiveStartKey: body.startKey,
      ScanIndexForward: false,
    })
    .promise();

  await postToConnection(
    client.connectionId,
    JSON.stringify({
      type: "messages",
      value: {
        messages: output.Items && output.Items.length > 0 ? output.Items : [],
        lastEvaluatedKey: output.LastEvaluatedKey,
      },
    }),
  );

  return responseOK;
};