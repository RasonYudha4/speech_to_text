import { createContext, useContext, useState, useEffect } from "react";
import { authService } from "../api/services/auth";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (token) {
      verifyToken();
    } else {
      setIsLoading(false);
    }
  }, []);

  const verifyToken = async () => {
    try {
      const userData = await authService.verify();
      setUser(userData.user || userData);
      setIsAuthenticated(true);
    } catch (error) {
      localStorage.removeItem("authToken");
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials) => {
    try {
      console.log("🔐 Attempting login with:", credentials);
      const response = await authService.login(credentials);
      console.log("📥 Login response:", response);

      if (response.token) {
        console.log("✅ Token found, setting auth state");
        localStorage.setItem("authToken", response.token);
        setUser(response.user || response);
        setIsAuthenticated(true);
        console.log("✅ Auth state updated - isAuthenticated: true");
        return { success: true };
      }

      console.log("❌ No token in response");
      return { success: false, error: "Login failed" };
    } catch (error) {
      console.log("❌ Login error:", error);
      return {
        success: false,
        error: error.response?.data?.message || "Login failed",
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await authService.register(userData);

      // Some APIs return a token on registration, others require login
      if (response.token) {
        localStorage.setItem("authToken", response.token);
        setUser(response.user || response);
        setIsAuthenticated(true);
      }

      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || "Registration failed",
      };
    }
  };

  const logout = () => {
    localStorage.removeItem("authToken");
    setUser(null);
    setIsAuthenticated(false);
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    verifyToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
