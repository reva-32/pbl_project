import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mail, Lock, ArrowRight, Eye, EyeOff,
  Building2, User, Phone, Briefcase, MapPin, Hash,
} from "lucide-react";
import authHero from "@/assets/auth-hero.jpg";
import { toast } from "sonner";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Common fields
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");

  // Signup-only fields
  const [companyName,  setCompanyName]  = useState("");
  const [ownerName,    setOwnerName]    = useState("");
  const [phone,        setPhone]        = useState("");
  const [businessType, setBusinessType] = useState("");
  const [city,         setCity]         = useState("");
  const [gstin,        setGstin]        = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const endpoint = isLogin ? "login" : "signup";

    const body = isLogin
      ? { email, password }
      : { email, password, companyName, ownerName, phone, businessType, city, gstin };

    try {
      const response = await fetch(`http://localhost:5000/api/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        if (isLogin) {
          // Store token + all user profile data
          localStorage.setItem("token", data.token);
          localStorage.setItem("user", JSON.stringify(data.user));
          toast.success(`Welcome back to MSME 360, ${data.user.ownerName}!`);
          navigate("/dashboard");
        } else {
          toast.success("Account created! You can now sign in.");
          setIsLogin(true);
          // Clear signup fields
          setCompanyName(""); setOwnerName(""); setPhone("");
          setBusinessType(""); setCity(""); setGstin("");
        }
      } else {
        toast.error(data.error || "Authentication failed");
      }
    } catch {
      toast.error("Could not connect to the server. Is it running?");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left - Hero */}
      <div className="hidden lg:flex lg:w-1/2 gradient-hero relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 opacity-40">
          <img src={authHero} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="relative z-10 max-w-lg animate-fade-in">
          <div className="glass-dark rounded-2xl p-8 shadow-elevated">
            <h1 className="text-4xl font-bold text-white mb-4">
              MSME <span className="text-gradient">360</span>
            </h1>
            <p className="text-lg text-white/70 mb-6">
              AI-powered Business Automation & Decision Engine for micro and small businesses.
            </p>
            <div className="flex gap-3 flex-wrap">
              {["Omnichannel Inbox", "Smart Invoicing", "GST Reports"].map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/10 text-white/80 border border-white/10"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background overflow-y-auto">
        <div className="w-full max-w-md animate-slide-up py-8">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <h1 className="text-2xl font-bold">
              MSME <span className="text-gradient">360</span>
            </h1>
          </div>

          <h2 className="text-2xl font-semibold text-foreground mb-1">
            {isLogin ? "Welcome back" : "Register your business"}
          </h2>
          <p className="text-muted-foreground mb-8">
            {isLogin
              ? "Sign in to your MSME 360 dashboard"
              : "Set up your company account — takes 2 minutes"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ── SIGNUP-ONLY FIELDS ── */}
            {!isLogin && (
              <>
                {/* Company Name */}
                <div>
                  <Label htmlFor="companyName" className="text-sm font-medium">
                    Company Name <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative mt-1.5">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="companyName"
                      required
                      placeholder="Acme Pvt. Ltd."
                      className="pl-10 h-11"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                </div>

                {/* Owner Name */}
                <div>
                  <Label htmlFor="ownerName" className="text-sm font-medium">
                    Owner / Contact Name <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="ownerName"
                      required
                      placeholder="Neelam Kapoor"
                      className="pl-10 h-11"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <Label htmlFor="phone" className="text-sm font-medium">
                    Phone Number <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative mt-1.5">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      required
                      placeholder="+91 98765 43210"
                      className="pl-10 h-11"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                {/* Business Type + City — side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="businessType" className="text-sm font-medium">
                      Business Type
                    </Label>
                    <div className="relative mt-1.5">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="businessType"
                        placeholder="Retail / Catering..."
                        className="pl-10 h-11"
                        value={businessType}
                        onChange={(e) => setBusinessType(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="city" className="text-sm font-medium">
                      City
                    </Label>
                    <div className="relative mt-1.5">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="city"
                        placeholder="Mumbai"
                        className="pl-10 h-11"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* GSTIN (optional) */}
                <div>
                  <Label htmlFor="gstin" className="text-sm font-medium">
                    GSTIN{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <div className="relative mt-1.5">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="gstin"
                      placeholder="22AAAAA0000A1Z5"
                      className="pl-10 h-11"
                      value={gstin}
                      onChange={(e) => setGstin(e.target.value)}
                    />
                  </div>
                </div>

                <hr className="border-border" />
              </>
            )}

            {/* ── COMMON FIELDS ── */}
            <div>
              <Label htmlFor="email" className="text-sm font-medium">
                Business Email <span className="text-destructive">*</span>
              </Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="you@business.com"
                  className="pl-10 h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="text-sm font-medium">
                Password <span className="text-destructive">*</span>
              </Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  className="pl-10 pr-10 h-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" variant="hero" className="w-full h-11" disabled={isLoading}>
              {isLoading
                ? "Processing..."
                : isLogin
                ? "Sign In"
                : "Create Company Account"}
              {!isLoading && <ArrowRight className="h-4 w-4 ml-1" />}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              className="text-primary font-medium hover:underline"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? "Register your business" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
