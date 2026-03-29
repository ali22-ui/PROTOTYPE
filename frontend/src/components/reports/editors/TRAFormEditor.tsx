import {
  EditorInput,
  EditorSection,
  EditorNumberInput,
  EditorTextarea,
} from './EditorPrimitives';
import type { TRAFormData } from '@/types';

interface TRAFormEditorProps {
  data: TRAFormData;
  onChange: (next: TRAFormData) => void;
}

export default function TRAFormEditor({ data, onChange }: TRAFormEditorProps): JSX.Element {
  return (
    <div className="space-y-3">
      <EditorSection title="Site Details">
        <EditorInput
          label="Site Name"
          value={data.siteName}
          onChange={(siteName) => onChange({ ...data, siteName })}
        />
        <div className="grid grid-cols-2 gap-2">
          <EditorInput
            label="Assessment Date"
            type="date"
            value={data.assessmentDate}
            onChange={(assessmentDate) => onChange({ ...data, assessmentDate })}
          />
          <EditorInput
            label="Assessor Name"
            value={data.assessorName}
            onChange={(assessorName) => onChange({ ...data, assessorName })}
          />
        </div>
      </EditorSection>

      <EditorSection title="Location & Environment">
        <div className="grid grid-cols-2 gap-2">
          <EditorInput
            label="Region"
            value={data.region}
            onChange={(region) => onChange({ ...data, region })}
          />
          <EditorInput
            label="Province / City"
            value={data.provinceCity}
            onChange={(provinceCity) => onChange({ ...data, provinceCity })}
          />
          <EditorInput
            label="Barangay"
            value={data.barangay}
            onChange={(barangay) => onChange({ ...data, barangay })}
          />
          <EditorInput
            label="Climate"
            value={data.climate}
            onChange={(climate) => onChange({ ...data, climate })}
          />
          <EditorInput
            label="Latitude"
            value={data.latitude}
            onChange={(latitude) => onChange({ ...data, latitude })}
          />
          <EditorInput
            label="Longitude"
            value={data.longitude}
            onChange={(longitude) => onChange({ ...data, longitude })}
          />
        </div>
        <EditorNumberInput
          label="Actual Visitor Count"
          value={data.actualVisitorCount}
          onChange={(actualVisitorCount) => onChange({ ...data, actualVisitorCount })}
        />
      </EditorSection>

      <EditorSection title="Site Profile">
        <div className="grid grid-cols-3 gap-2">
          <EditorInput
            label="Total Area (ha)"
            value={data.totalAreaHectares}
            onChange={(totalAreaHectares) => onChange({ ...data, totalAreaHectares })}
          />
          <EditorInput
            label="Core Zone (ha)"
            value={data.coreZoneHectares}
            onChange={(coreZoneHectares) => onChange({ ...data, coreZoneHectares })}
          />
          <EditorInput
            label="Buffer Zone (ha)"
            value={data.bufferZoneHectares}
            onChange={(bufferZoneHectares) => onChange({ ...data, bufferZoneHectares })}
          />
        </div>
        <EditorTextarea
          label="Existing Facilities"
          value={data.existingFacilities}
          onChange={(existingFacilities) => onChange({ ...data, existingFacilities })}
          rows={2}
        />
      </EditorSection>

      <EditorSection title="Assessment Notes">
        <EditorTextarea
          label="Key Natural Values"
          value={data.keyNaturalValues}
          onChange={(keyNaturalValues) => onChange({ ...data, keyNaturalValues })}
          rows={3}
        />
        <EditorTextarea
          label="Key Cultural Values"
          value={data.keyCulturalValues}
          onChange={(keyCulturalValues) => onChange({ ...data, keyCulturalValues })}
          rows={3}
        />
      </EditorSection>
    </div>
  );
}
