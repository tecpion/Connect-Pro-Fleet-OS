// Connect Pro Fleet — Build #20 friendly 404 page.
//
// Shows a clear "page not found" with Dashboard + Back actions. Logs the
// attempted route to the console for development (no stack trace to users).

import { useLocation, useNavigate } from "@/lib/router-compat";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.warn("404: route not found:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Compass size={22} className="text-muted-foreground" />
        </div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or may have moved. Use the
          navigation to get back to your work.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button
            onClick={() => navigate("/")}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Go to dashboard
          </Button>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
