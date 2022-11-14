import logo from './logo.svg';
import './App.css';
import { useEffect, useRef, useState } from 'react';
import Welcome from './Welcome';
import Sidebar from './Sidebar';
import Conversation from './Conversation';
import WebsocketConnector from './WebsocketConnector';
const webSocketConnector = new WebsocketConnector();


function App() {
   // edited nickname from dynamo table is not rendered to UI because of this?
   // acting as temp storage?
   // this is our nickname
   const [nickname, setNickname] = useState(window.localStorage.getItem("nickname") || ""); 
   // this is the other client nickname we chat to
   const [targetNicknameValue, setTargetNicknameValue] = useState("");

   const [messages,setMessages] = useState([]);

   // for displaying clients list @sidebar
   const [clients, setClients] = useState([]);
   

   useEffect(() => {
      window.localStorage.setItem("nickname", nickname)
   });

  const webSocketConnectorRef = useRef(webSocketConnector);
//nickname can't be empty
   if (nickname === "") {
      return <Welcome setNickname={setNickname} />;
   }


   // websocket instance initiate
   const url = `wss://c72jazo64m.execute-api.us-east-1.amazonaws.com/dev?nickname=${nickname}`;
   const ws = webSocketConnectorRef.current.getConnection(url);

   // establish connection
   ws.onopen = () => {
      ws.send(JSON.stringify({
         action: "getClients", // we don't want to exclude the connection ID of connector so used getclients
      })
      );
   };


   //parsing the str to obj and pushing payload happen for the retrieved clients
   ws.onmessage = (e) => {
   const message =  JSON.parse(e.data);
 
   console.log(message)

   if(message.type === 'clients') {

      setClients((message.value.clients))
   }

   if(message.type === 'messages') {

      setMessages((message.value.messages))
   }

   };

   const setTargetNickname = ()=>{
   
      ws.send(JSON.stringify({
         action: "getMessages",
         targetNicknameValue: nickname,
         limit: 1000,
      }));

      setTargetNicknameValue(nickname);
   }

   
  return (   
   <div className='flex'>
      <div className='flex-name w-16 md:w-48 border-r-2'>
         <Sidebar clients={clients}  setTargetNickname={setTargetNickname}/>
      </div>
      <div className='flex-auto'>
         <Conversation messages={messages}/>;
     </div>
   </div>
  );
}

export default App;
