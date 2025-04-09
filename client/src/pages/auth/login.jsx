import {
  Card,
  Input,
  Checkbox,
  Button,
  Typography,
} from "@material-tailwind/react";
import axios from "axios";
import { use } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";


export function LogIn() {
    const [username,setUsername] = useState("");
    const [APIKey, setAPIKey] = useState("");

    const handleRegister = async () => {
        try {
            console.log('first username', username);
            console.log('first apikey', APIKey);
          const response = await axios.post("http://localhost:8000/login", {
            username,
            APIKey,
          });
          console.log("Response:", response.data);
          alert("Registration successful!");
        } catch (error) {
          console.error("Error:", error.response?.data || error.message);
          alert("Registration failed. Please try again.");
        }
      };

  return (
    <section className="m-8 flex">
            <div className="w-1/4 h-full hidden lg:block">
        <img
          src="/img/pattern.png"
          className="h-full w-full object-cover rounded-3xl"
        />
      </div>
      <div className="w-full lg:w-2/4 flex flex-col items-center justify-center">
        <div className="text-center">
          <Typography variant="h2" className="font-bold mb-4">Join Us Today</Typography>
          <Typography variant="paragraph" color="blue-gray" className="text-lg font-normal">Enter your username and API Key to register.</Typography>
        </div>
        <form 
        className="mt-8 mb-2 mx-auto w-80 max-w-screen-lg lg:w-1/2"
        onSubmit={(e) => e.preventDefault()}
        >
          <div className="mb-1 flex flex-col gap-6">
            <Typography variant="small" color="blue-gray" className="-mb-3 font-medium">
              Username
            </Typography>
            <Input
              size="lg"
              placeholder="username"
              className=" !border-t-blue-gray-200 focus:!border-t-gray-900"
              labelProps={{
                className: "before:content-none after:content-none",
              }}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          
          <div className="mb-1 flex flex-col gap-6">
            <Typography variant="small" color="blue-gray" className="-mb-3 font-medium">
              API Key
            </Typography>
            <Input
              size="lg"
              placeholder="Your API Key"
              className=" !border-t-blue-gray-200 focus:!border-t-gray-900"
              labelProps={{
                className: "before:content-none after:content-none",
              }}
              value={APIKey}
              onChange={(e) => setAPIKey(e.target.value)}
            />
          </div>
          
          <Button className="mt-6" fullWidth onClick={handleRegister}>
            Register Now
          </Button>
        </form>

      </div>
      <div className="w-1/4 h-full hidden lg:block">
        <img
          src="/img/pattern.png"
          className="h-full w-full object-cover rounded-3xl"
        />
      </div>
    </section>
  );
}

export default LogIn;
