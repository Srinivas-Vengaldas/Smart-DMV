"use client";

export function SectionF() {
  return (
    <fieldset className="border border-foreground/30 p-4">
      <legend className="px-2 text-sm font-bold text-foreground">
        F. If you are 70+ years of age, your licensed medical practitioner MUST VALIDATE this section
      </legend>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Practitioner's Name
          </label>
          <input
            type="text"
            name="practitioner_name"
            className="border-b border-foreground/30 bg-transparent py-1 text-sm outline-none focus:border-foreground"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Identification Number
          </label>
          <input
            type="text"
            name="practitioner_id"
            className="border-b border-foreground/30 bg-transparent py-1 text-sm outline-none focus:border-foreground"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Phone Number
          </label>
          <input
            type="text"
            name="practitioner_phone"
            className="border-b border-foreground/30 bg-transparent py-1 text-sm outline-none focus:border-foreground"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Email
          </label>
          <input
            type="email"
            name="practitioner_email"
            className="border-b border-foreground/30 bg-transparent py-1 text-sm outline-none focus:border-foreground"
          />
        </div>
      </div>
    </fieldset>
  );
}