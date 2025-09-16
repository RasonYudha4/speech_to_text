import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom'; // Add useNavigate and Link

const Register = () => {
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    password: '', 
    confirmPassword: '' 
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate(); 

  const handleChange = (e) => {
    setFormData(prev => ({ 
      ...prev, 
      [e.target.name]: e.target.value 
    }));
  };

  const validateForm = () => {
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return false;
    }
    if (!formData.name.trim()) {
      setError('Name is required');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!validateForm()) {
      setIsLoading(false);
      return;
    }

    const { confirmPassword, ...userData } = formData;
    const result = await register(userData);
    
    if (!result.success) {
      setError(result.error);
    } else {
      navigate('/', { replace: true });
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#14203C] p-8">
      <div className="max-w-md w-full">
        <div className="bg-[#09091e] rounded-lg shadow-2xl p-8 space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-[#b5b3b3] mb-2">
              Video Transcriber
            </h1>
            <h2 className="text-2xl font-semibold text-[#b5b3b3] opacity-80">
              Create your account
            </h2>
            <p className="text-[#b5b3b3] opacity-60 mt-2">
              Join us and start transcribing your videos
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
                <label htmlFor="name" className="block text-sm font-medium text-[#b5b3b3] mb-2">
                  Full Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#14203C] border border-[#b5b3b3]/20 rounded-md text-[#b5b3b3] placeholder-[#b5b3b3]/50 focus:outline-none focus:ring-2 focus:ring-[#b5b3b3]/50 focus:border-transparent transition-all duration-200"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#b5b3b3] mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#14203C] border border-[#b5b3b3]/20 rounded-md text-[#b5b3b3] placeholder-[#b5b3b3]/50 focus:outline-none focus:ring-2 focus:ring-[#b5b3b3]/50 focus:border-transparent transition-all duration-200"
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-[#b5b3b3] mb-2">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder="Create a password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#14203C] border border-[#b5b3b3]/20 rounded-md text-[#b5b3b3] placeholder-[#b5b3b3]/50 focus:outline-none focus:ring-2 focus:ring-[#b5b3b3]/50 focus:border-transparent transition-all duration-200"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#b5b3b3] mb-2">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#14203C] border border-[#b5b3b3]/20 rounded-md text-[#b5b3b3] placeholder-[#b5b3b3]/50 focus:outline-none focus:ring-2 focus:ring-[#b5b3b3]/50 focus:border-transparent transition-all duration-200"
                />
              </div>
            </div>

            <div className="text-xs text-[#b5b3b3] opacity-60 space-y-1">
              <p>Password requirements:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>At least 8 characters long</li>
                <li>Must match the confirmation password</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#14203C] hover:bg-[#1a2a4a] text-[#b5b3b3] font-medium py-3 px-4 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#b5b3b3]/50 focus:ring-offset-2 focus:ring-offset-[#09091e] disabled:opacity-50 disabled:cursor-not-allowed border border-[#b5b3b3]/20"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-[#b5b3b3]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating account...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="text-center pt-4">
            <p className="text-sm text-[#b5b3b3] opacity-60">
              Already have an account?{' '}
              <Link 
                to="/login" 
                className="text-[#b5b3b3] hover:opacity-80 underline transition-opacity"
              >
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;