import { Routes, Route, Navigate } from "react-router-dom";
import { Dashboard, Auth } from "@/layouts";
import { useEffect, useState } from "react";
import axios from "axios";

function App() {
  const [products,setProducts] = useState([]);

  useEffect(() => {
    axios.get("http://localhost:8000/data").then((res) => {
      console.log(res.data);
      setProducts(res.data.products);
    }).catch((err) => console.log(err));
  }, []);

  return (
    // <div>{products && products.length > 0 ? products.map((pro,ind) => <p key={ind}>{pro}</p>) : (<p>loading</p>)}</div>
    <Routes>
      <Route path="/dashboard/*" element={<Dashboard />} />
      <Route path="/auth/*" element={<Auth />} />
      <Route path="*" element={<Navigate to="/dashboard/home" replace />} />
    </Routes>
  );
}

export default App;
