"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { SectionA } from "./section-a";
import { SectionB, type SectionBDefaults } from "./section-b";
import { SectionC } from "./section-c";
import { SectionD } from "./section-d";
import { SectionE } from "./section-e";
import { SectionF } from "./section-f";
import { SectionG } from "./section-g";
import { SectionH } from "./section-h";

const STEPS = [
  {
    label: "Personal Info",
    shortLabel: "Info",
    description: "Application type & personal details",
  },
  {
    label: "History",
    shortLabel: "History",
    description: "Driving & medical history",
  },
  {
    label: "Preferences",
    shortLabel: "Prefs",
    description: "Preferences & medical practitioner",
  },
  {
    label: "Registration",
    shortLabel: "Register",
    description: "Voter registration & certification",
  },
];

type DraftResponse =
  | { draft: null }
  | {
      draft: {
        applicationId: string;
        status?: string;
        currentStep: number;
        data: Record<string, any>;
      };
    };

function StepIndicator({
  steps,
  currentStep,
}: {
  steps: typeof STEPS;
  currentStep: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <div key={step.label} className="flex flex-1 items-center gap-2">
            <div className="flex min-w-0 flex-col items-center gap-1.5">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                  isCompleted
                    ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent
                      ? "border-primary bg-background text-primary"
                      : "border-muted-foreground/30 bg-background text-muted-foreground/50"
                }`}
              >
                {isCompleted ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>

              <div className="flex flex-col items-center text-center">
                <span
                  className={`text-[11px] font-medium leading-tight ${
                    isCurrent
                      ? "text-foreground"
                      : isCompleted
                        ? "text-foreground"
                        : "text-muted-foreground/60"
                  }`}
                >
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{step.shortLabel}</span>
                </span>
              </div>
            </div>

            {index < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 rounded-full transition-colors ${
                  index < currentStep ? "bg-primary" : "bg-muted-foreground/20"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FormStepper() {
  const { user } = useAuth();
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState(0);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [isRejectedEdit, setIsRejectedEdit] = useState(false);

  const [hasRemoteDraft, setHasRemoteDraft] = useState(false);
  const [remoteDraft, setRemoteDraft] = useState<
    null | NonNullable<DraftResponse["draft"]>
  >(null);
  const [localDraftData, setLocalDraftData] = useState<Record<string, any>>({});

  const [isSaving, setIsSaving] = useState(false);
  const [savedPulse, setSavedPulse] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSubmitSuccess, setShowSubmitSuccess] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<number | null>(null);
  const lastSavedJson = useRef<string>("");

  const sectionBDefaults: SectionBDefaults | undefined = user
    ? {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        city: user.city,
        zip: user.zip,
      }
    : undefined;

  const getFormSnapshot = useCallback(() => {
    const formEl = formRef.current?.closest("form");
    if (!formEl) return null;

    const fd = new FormData(formEl);
    const data: Record<string, any> = {};

    fd.forEach((value, key) => {
      const v = value.toString();

      if (key in data) {
        const current = data[key];
        data[key] = Array.isArray(current) ? [...current, v] : [current, v];
      } else {
        data[key] = v;
      }
    });

    return data;
  }, []);

  const applySnapshotToForm = useCallback((snapshot: Record<string, any>) => {
    const formEl = formRef.current?.closest("form");
    if (!formEl) return;

    Object.entries(snapshot).forEach(([name, value]) => {
      const nodes = formEl.querySelectorAll(`[name="${CSS.escape(name)}"]`);
      const values = Array.isArray(value)
        ? value.map(String)
        : [value == null ? "" : String(value)];

      nodes.forEach((el) => {
        const element = el as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement;

        if (element instanceof HTMLInputElement && element.type === "radio") {
          element.checked = values.includes(element.value);
          return;
        }

        if (element instanceof HTMLInputElement && element.type === "checkbox") {
          element.checked =
            values.includes(element.value) || values.includes("on");
          return;
        }

        element.value = values[0] ?? "";
      });
    });
  }, []);

  const captureSnapshotToState = useCallback(() => {
    const snapshot = getFormSnapshot();
    if (!snapshot) return;

    setLocalDraftData((previous) => ({
      ...previous,
      ...snapshot,
    }));
  }, [getFormSnapshot]);

  const saveDraftNow = useCallback(
    async (stepOverride?: number) => {
      if (!user) {
        setSaveError("You must be logged in to save a draft.");
        return;
      }

      const snapshot = getFormSnapshot();
      if (!snapshot) return;

      const mergedSnapshot = {
        ...localDraftData,
        ...snapshot,
      };

      const stepToSave =
        typeof stepOverride === "number" ? stepOverride : currentStep;

      const json = JSON.stringify({
        applicationId,
        stepToSave,
        mergedSnapshot,
      });

      if (json === lastSavedJson.current) return;

      setLocalDraftData(mergedSnapshot);
      setIsSaving(true);
      setSaveError(null);

      try {
        const res = await fetch("/application/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            applicationId,
            currentStep: stepToSave,
            data: mergedSnapshot,
          }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || `Draft save failed (${res.status})`);
        }

        if (data?.applicationId) {
          setApplicationId(data.applicationId);
        }

        if (data?.wasRejected) {
          setIsRejectedEdit(true);
        }

        lastSavedJson.current = json;
        setSavedPulse(true);

        window.setTimeout(() => {
          setSavedPulse(false);
        }, 1200);
      } catch (error: any) {
        setSaveError(error?.message || "Failed to save draft");
      } finally {
        setIsSaving(false);
      }
    },
    [applicationId, currentStep, getFormSnapshot, localDraftData, user]
  );

  const scheduleAutosave = useCallback(() => {
    captureSnapshotToState();

    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = window.setTimeout(() => {
      void saveDraftNow();
    }, 800);
  }, [captureSnapshotToState, saveDraftNow]);

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      try {
        const res = await fetch("/application/draft", {
          credentials: "include",
          cache: "no-store",
        });

        const data = (await res.json().catch(() => null)) as DraftResponse | null;

        if (cancelled) return;

        if (data && "draft" in data && data.draft) {
          setRemoteDraft(data.draft);
          setApplicationId(data.draft.applicationId);
          setIsRejectedEdit(data.draft.status === "REJECTED");

          if (data.draft.status === "REJECTED") {
            setCurrentStep(data.draft.currentStep || 0);
            setLocalDraftData(data.draft.data || {});

            window.setTimeout(() => {
              applySnapshotToForm(data.draft.data || {});
            }, 100);

            setHasRemoteDraft(false);
          } else {
            setHasRemoteDraft(true);
          }
        } else {
          setRemoteDraft(null);
          setApplicationId(null);
          setIsRejectedEdit(false);
          setHasRemoteDraft(false);
        }
      } catch {
        if (!cancelled) {
          setRemoteDraft(null);
          setApplicationId(null);
          setIsRejectedEdit(false);
          setHasRemoteDraft(false);
        }
      }
    }

    void loadDraft();

    return () => {
      cancelled = true;
    };
  }, [applySnapshotToForm]);

  const restoreRemoteDraft = useCallback(() => {
    if (!remoteDraft) return;

    setApplicationId(remoteDraft.applicationId);
    setIsRejectedEdit(remoteDraft.status === "REJECTED");
    setCurrentStep(remoteDraft.currentStep || 0);
    setLocalDraftData(remoteDraft.data || {});

    window.setTimeout(() => {
      applySnapshotToForm(remoteDraft.data || {});
    }, 80);

    setHasRemoteDraft(false);
  }, [remoteDraft, applySnapshotToForm]);

  const discardRemoteDraftBanner = useCallback(() => {
    setHasRemoteDraft(false);
  }, []);

  const goNext = useCallback(async () => {
    if (currentStep >= STEPS.length - 1) return;

    captureSnapshotToState();
    await saveDraftNow(currentStep);
    setCurrentStep((step) => step + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep, captureSnapshotToState, saveDraftNow]);

  const goPrev = useCallback(async () => {
    if (currentStep <= 0) return;

    captureSnapshotToState();
    await saveDraftNow(currentStep);
    setCurrentStep((step) => step - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep, captureSnapshotToState, saveDraftNow]);

  useEffect(() => {
    const formEl = formRef.current?.closest("form");
    if (!formEl) return;

    const handler = () => scheduleAutosave();

    formEl.addEventListener("input", handler, true);
    formEl.addEventListener("change", handler, true);

    return () => {
      formEl.removeEventListener("input", handler, true);
      formEl.removeEventListener("change", handler, true);
    };
  }, [scheduleAutosave]);

  useEffect(() => {
    if (!Object.keys(localDraftData).length) return;

    const timer = window.setTimeout(() => {
      applySnapshotToForm(localDraftData);
    }, 50);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentStep, localDraftData, applySnapshotToForm]);

  const submitApplication = useCallback(async () => {
    setSubmitError(null);

    captureSnapshotToState();
    await saveDraftNow(currentStep);

    setIsSubmitting(true);

    try {
      const res = await fetch("/application/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          applicationId,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (Array.isArray(data?.missing) && data.missing.length > 0) {
          const labels: Record<string, string> = {
            email: "Email",
            firstName: "First Name",
            lastName: "Last Name",
            phone: "Phone Number",
          };

          const missingLabels = data.missing.map(
            (key: string) => labels[key] || key
          );

          throw new Error(`Please complete: ${missingLabels.join(", ")}`);
        }

        throw new Error(data?.error || `Submit failed (${res.status})`);
      }

      if (data?.applicationId) {
        setApplicationId(data.applicationId);
      }

      setIsRejectedEdit(false);
      setShowSubmitSuccess(true);
    } catch (error: any) {
      setSubmitError(error?.message || "Submit failed");
    } finally {
      setIsSubmitting(false);
    }
  }, [applicationId, currentStep, captureSnapshotToState, saveDraftNow]);

  if (showSubmitSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-md rounded-xl border border-green-200 bg-background p-6 shadow-lg">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-600"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <div className="mt-4 text-center">
            <h2 className="text-xl font-bold text-foreground">
              Submission Successful
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your application has been submitted successfully. Please proceed to document upload.
            </p>
          </div>

          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              onClick={() => router.push("/document-upload")}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Proceed to Document Upload
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={formRef} className="flex flex-col gap-6">
      {isRejectedEdit && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-800">
            Editing Rejected Application
          </p>
          <p className="mt-1 text-sm text-red-700">
            Make the required corrections and resubmit your application before uploading a new document.
          </p>
        </div>
      )}

      {hasRemoteDraft && remoteDraft && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground">
              You have a saved draft in the database. Restore it?
            </span>
          </div>

          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={discardRemoteDraftBanner}
              className="text-xs"
            >
              Not now
            </Button>
            <Button
              size="sm"
              onClick={restoreRemoteDraft}
              className="bg-primary text-xs text-primary-foreground hover:bg-primary/90"
            >
              Restore
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <StepIndicator steps={STEPS} currentStep={currentStep} />

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Step {currentStep + 1} of {STEPS.length}: {STEPS[currentStep].description}
        </p>

        <div className="mt-3 flex flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground">
          {isSaving ? (
            <span>Saving…</span>
          ) : savedPulse ? (
            <span className="text-primary">Saved</span>
          ) : (
            <span>Autosave enabled</span>
          )}

          {saveError ? <span className="text-destructive">{saveError}</span> : null}
          {submitError ? <span className="text-destructive">{submitError}</span> : null}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {currentStep === 0 && (
          <>
            <SectionA />
            <SectionB defaults={sectionBDefaults} />
          </>
        )}

        {currentStep === 1 && (
          <>
            <SectionC />
            <SectionD />
          </>
        )}

        {currentStep === 2 && (
          <>
            <SectionE />
            <SectionF />
          </>
        )}

        {currentStep === 3 && (
          <>
            <SectionG />
            <SectionH />
          </>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <Button
          type="button"
          variant="outline"
          onClick={goPrev}
          disabled={currentStep === 0}
          className="gap-1.5"
        >
          Previous
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void saveDraftNow()}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          Save now
        </Button>

        {currentStep < STEPS.length - 1 ? (
          <Button
            type="button"
            onClick={goNext}
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            disabled={isSubmitting || isSaving}
            onClick={() => void submitApplication()}
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSubmitting ? "Submitting…" : "Submit Application"}
          </Button>
        )}
      </div>
    </div>
  );
}