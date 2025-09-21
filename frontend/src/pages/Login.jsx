import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import SuccessModal from "../components/SuccessModal";
import GoogleLoginButton from "../components/GoogleLoginButton";

const Login = () => {
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false); // Add modal state
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const result = await login(credentials);

    if (!result.success) {
      setError(result.error);
      setIsLoading(false);
    } else {
      setShowSuccessModal(true);
      setIsLoading(false);

      setTimeout(() => {
        navigate("/", { replace: true });
      }, 2000);
    }
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-[#14203C] p-8">
        <div className="max-w-md w-full">
          <div className="bg-[#09091e] rounded-lg shadow-2xl p-8 space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-[#b5b3b3] mb-2">
                Video Transcriber
              </h1>
              <p className="text-[#b5b3b3] opacity-60 mt-2">
                Welcome back! Please enter your credentials
              </p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="bg-red-900/30 border border-red-700/50 text-red-300 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-[#b5b3b3] mb-2"
                  >
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    placeholder="Enter your email"
                    value={credentials.email}
                    onChange={(e) =>
                      setCredentials((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-3 bg-[#14203C] border border-[#b5b3b3]/20 rounded-md text-[#b5b3b3] placeholder-[#b5b3b3]/50 focus:outline-none focus:ring-2 focus:ring-[#b5b3b3]/50 focus:border-transparent transition-all duration-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-[#b5b3b3] mb-2"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    placeholder="Enter your password"
                    value={credentials.password}
                    onChange={(e) =>
                      setCredentials((prev) => ({
                        ...prev,
                        password: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-3 bg-[#14203C] border border-[#b5b3b3]/20 rounded-md text-[#b5b3b3] placeholder-[#b5b3b3]/50 focus:outline-none focus:ring-2 focus:ring-[#b5b3b3]/50 focus:border-transparent transition-all duration-200"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#14203C] hover:bg-[#1a2a4a] text-[#b5b3b3] font-medium py-3 px-4 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#b5b3b3]/50 focus:ring-offset-2 focus:ring-offset-[#09091e] disabled:opacity-50 disabled:cursor-not-allowed border border-[#b5b3b3]/20"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-[#b5b3b3]"
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
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            <div className="my-6 text-center text-[#b5b3b3] opacity-70">
              <span>or continue with</span>
            </div>

            <GoogleLoginButton />

            <div className="text-center pt-4">
              <p className="text-sm text-[#b5b3b3] opacity-60">
                Don't have an account?{" "}
                <Link
                  to="/register"
                  className="text-[#b5b3b3] hover:opacity-80 underline transition-opacity"
                >
                  Sign up here
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title="Login Successful!"
        message="Welcome back! Redirecting to your dashboard..."
      />
    </>
  );
};

export default Login;
