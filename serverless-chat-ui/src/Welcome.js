import { useState } from 'react';


const Welcome = ({setNickname}) => {

    const [nicknameValue, setNicknameValue] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    return (
      
<body className="bg-gray-10 ">
   <div className="flex justify-center h-screen w-screen items-center">
    <div className="w-full md:w-1/2 flex flex-col items-center " >
        
        <h1 className="text-center text-2xl font-bold text-gray-600 mb-6">RealTalk</h1>
        
        <div className="w-3/4 mb-6">
            <input type="email" name="email" id="email" 
            className="w-full py-4 px-8 bg-slate-200 placeholder:font-semibold rounded hover:ring-1 outline-blue-500" 
            placeholder="Nickname"
            onChange={(e)=> setNicknameValue(e.target.value)}
            value = {nicknameValue}
            />
            {errorMessage !== "" ? <span className="text-red-500 font-medium text-xs">{errorMessage}</span>: ""}
        </div>     
        <div className="w-3/4 mt-4">
            <button
            onClick={() => nicknameValue === "" ? setErrorMessage("nickname required!"): setNickname(nicknameValue)}
             type="submit" className="py-4 bg-blue-400 w-full rounded text-blue-50 font-bold hover:bg-blue-700">Join</button>
        </div>
    </div>
   </div>
</body>
    )
}

export default Welcome