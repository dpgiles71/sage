import React from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  return (
    <div style={{minHeight:"100vh",background:"#0a0d0f",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center",color:"#e8e2d9",fontFamily:"Georgia,serif"}}>
        <div style={{fontSize:48,marginBottom:16}}>🌿</div>
        <h1 style={{fontSize:32,fontWeight:300,marginBottom:8}}>sage</h1>
        <p style={{fontSize:14,color:"#5a5650"}}>Loading your wellness coach...</p>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
