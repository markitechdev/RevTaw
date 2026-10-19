"use client";

import { Field, fieldA11y } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SubjectWithFolders } from "@/lib/materials/queries";

export const NEW_SUBJECT = "__new__";

export type PlacementValue = {
  subjectId: string;
  folderId: string;
  newSubjectName: string;
};

export const EMPTY_PLACEMENT: PlacementValue = { subjectId: "", folderId: "", newSubjectName: "" };

/**
 * Subject + folder pickers used when adding a material. Choosing "New subject"
 * reveals a name field; the subject is created together with the material.
 * The controls are controlled and carry no `name`: callers submit the value
 * through `placementPayload()` (hidden inputs or an action argument).
 */
export function PlacementFields({
  subjects,
  value,
  onChange,
  errors = {},
  idPrefix = "placement",
  disabled,
}: {
  subjects: SubjectWithFolders[];
  value: PlacementValue;
  onChange: (next: PlacementValue) => void;
  errors?: Record<string, string>;
  idPrefix?: string;
  disabled?: boolean;
}) {
  const subject = subjects.find((item) => item.id === value.subjectId);
  const isNew = value.subjectId === NEW_SUBJECT;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field id={`${idPrefix}-subject`} label="Subject" error={errors.subjectId} hint="Optional">
        <Select
          {...fieldA11y(`${idPrefix}-subject`, errors.subjectId, true)}
          value={value.subjectId}
          disabled={disabled}
          onChange={(event) =>
            onChange({ subjectId: event.target.value, folderId: "", newSubjectName: "" })
          }
        >
          <option value="">No subject</option>
          {subjects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
          <option value={NEW_SUBJECT}>+ New subject…</option>
        </Select>
      </Field>

      {isNew ? (
        <Field id={`${idPrefix}-new-subject`} label="New subject name" error={errors.newSubjectName} required>
          <Input
            {...fieldA11y(`${idPrefix}-new-subject`, errors.newSubjectName)}
            type="text"
            maxLength={80}
            placeholder="e.g. Data Structures"
            value={value.newSubjectName}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, newSubjectName: event.target.value })}
          />
        </Field>
      ) : (
        <Field id={`${idPrefix}-folder`} label="Folder" error={errors.folderId} hint="Optional">
          <Select
            {...fieldA11y(`${idPrefix}-folder`, errors.folderId, true)}
            value={value.folderId}
            disabled={disabled || !subject || subject.folders.length === 0}
            onChange={(event) => onChange({ ...value, folderId: event.target.value })}
          >
            <option value="">{subject && subject.folders.length > 0 ? "No folder" : "No folders yet"}</option>
            {subject?.folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}

/** Converts the picker state into the shape the server actions expect. */
export function placementPayload(value: PlacementValue) {
  const isNew = value.subjectId === NEW_SUBJECT;
  return {
    subjectId: isNew ? "" : value.subjectId,
    folderId: isNew ? "" : value.folderId,
    newSubjectName: isNew ? value.newSubjectName : "",
  };
}
