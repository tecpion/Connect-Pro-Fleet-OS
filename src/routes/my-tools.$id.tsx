import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { useCustomMenuLinks } from "@/lib/store/customMenuLinkStore";
import { useNavigate, useParams } from "@/lib/router-compat";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/my-tools/$id")({
  component: () => (
    <RequireAuth>
      <StaffLayout>
        <EmbeddedTool />
      </StaffLayout>
    </RequireAuth>
  ),
});

function EmbeddedTool() {
  const { id } = useParams() as { id: string };
  const { links } = useCustomMenuLinks();
  const navigate = useNavigate();
  const [loadFailed, setLoadFailed] = useState(false);

  const link = links.find((l) => l.id === id);

  useEffect(() => {
    setLoadFailed(false);
  }, [id]);

  if (!link) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">
            Tool not found
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This custom tool link does not exist or you don&apos;t have access.
          </p>
          <Button onClick={() => navigate("/")} className="mt-4">
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{link.name}</h1>
          {link.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {link.description}
            </p>
          )}
        </div>
        <a href={link.url} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm">
            <ExternalLink className="mr-1.5 h-4 w-4" />
            Open in New Tab
          </Button>
        </a>
      </div>
      {loadFailed ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
          <AlertTriangle className="h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">
            This website does not allow embedded viewing.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open it in a new tab instead.
          </p>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4"
          >
            <Button>
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Open in New Tab
            </Button>
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <iframe
            src={link.url}
            title={link.name}
            className="h-[75vh] w-full"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            onLoad={() => {
              // If the iframe loaded but is effectively blank (blocked by
              // X-Frame-Options/CSP), onLoad still fires — we rely on the
              // user seeing the fallback button above. Some browsers fire
              // onError for blocked frames.
            }}
            onError={() => setLoadFailed(true)}
          />
        </div>
      )}
    </div>
  );
}
