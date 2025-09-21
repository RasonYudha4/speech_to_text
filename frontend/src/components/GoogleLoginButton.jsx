import { GoogleLogin } from "@react-oauth/google";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useState } from "react";

const GoogleLoginButton = ({ onSuccess: onSuccessCallback, onError: onErrorCallback }) => {
  const { googleLogin } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleSuccess = async (credentialResponse) => {
    try {
      setIsLoading(true);
      
      console.log("Google credential response:", credentialResponse);
      
      if (!credentialResponse?.credential) {
        console.error("No credential received from Google");
        onErrorCallback?.("No credential received from Google");
        return;
      }

      // Ensure we're sending a string JWT token
      const jwtToken = credentialResponse.credential;
      console.log("JWT Token type:", typeof jwtToken);
      console.log("JWT Token preview:", jwtToken.substring(0, 50) + "...");
      
      const result = await googleLogin(jwtToken);

      if (result.success) {
        onSuccessCallback?.();
        setTimeout(() => {
          navigate("/", { replace: true });
        }, 2000);
      } else {
        console.error("Google login failed:", result.error);
        onErrorCallback?.(result.error);
      }
    } catch (error) {
      console.error("Google login error:", error);
      onErrorCallback?.(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleError = () => {
    console.error("Google Login Failed");
    onErrorCallback?.("Google Login Failed");
  };

  return (
    <div className="w-full flex justify-center mt-4 relative">
      {isLoading && (
        <div className="absolute inset-0 bg-[#09091e]/50 rounded-md flex items-center justify-center z-10">
          <svg
            className="animate-spin h-5 w-5 text-[#b5b3b3]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      )}
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={handleError}
        useOneTap={false}
        auto_select={false}
        size="large"
        theme="outline"
        shape="pill"
        disabled={isLoading}
      />
    </div>
  );
};

export default GoogleLoginButton;