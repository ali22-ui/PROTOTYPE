import {
  EditorCheckbox,
  EditorInput,
  EditorSection,
  EditorTextarea,
} from './EditorPrimitives';
import type { TIEZAFormData } from '@/types';

interface TiezaFormEditorProps {
  data: TIEZAFormData;
  onChange: (next: TIEZAFormData) => void;
}

export default function TiezaFormEditor({ data, onChange }: TiezaFormEditorProps): JSX.Element {
  return (
    <div className="space-y-3">
      <EditorSection title="Enterprise Zone Application">
        <EditorInput
          label="Enterprise Name"
          value={data.enterpriseName}
          onChange={(enterpriseName) => onChange({ ...data, enterpriseName })}
        />
        <EditorInput
          label="Enterprise Zone Location"
          value={data.enterpriseZoneLocation}
          onChange={(enterpriseZoneLocation) => onChange({ ...data, enterpriseZoneLocation })}
        />
        <div className="grid grid-cols-2 gap-2">
          <EditorInput
            label="Land Area (ha)"
            value={data.landAreaHectares}
            onChange={(landAreaHectares) => onChange({ ...data, landAreaHectares })}
          />
          <EditorInput
            label="Investment Priority"
            value={data.investmentPriority}
            onChange={(investmentPriority) => onChange({ ...data, investmentPriority })}
          />
        </div>
      </EditorSection>

      <EditorSection title="Infrastructure Readiness">
        <EditorCheckbox
          label="Road Access"
          checked={data.roadAccess}
          onChange={(roadAccess) => onChange({ ...data, roadAccess })}
        />
        <EditorCheckbox
          label="Utility Connection"
          checked={data.utilityConnection}
          onChange={(utilityConnection) => onChange({ ...data, utilityConnection })}
        />
        <EditorCheckbox
          label="Waste Management"
          checked={data.wasteManagement}
          onChange={(wasteManagement) => onChange({ ...data, wasteManagement })}
        />
        <EditorCheckbox
          label="Emergency Response"
          checked={data.emergencyResponse}
          onChange={(emergencyResponse) => onChange({ ...data, emergencyResponse })}
        />
      </EditorSection>

      <EditorSection title="Notes & Signature">
        <EditorTextarea
          label="Infrastructure Notes"
          value={data.infrastructureNotes}
          onChange={(infrastructureNotes) => onChange({ ...data, infrastructureNotes })}
          rows={3}
        />
        <EditorInput
          label="Authorized Representative"
          value={data.authorizedRepresentative}
          onChange={(authorizedRepresentative) => onChange({ ...data, authorizedRepresentative })}
        />
        <EditorInput
          type="date"
          label="Date Signed"
          value={data.dateSigned}
          onChange={(dateSigned) => onChange({ ...data, dateSigned })}
        />
      </EditorSection>
    </div>
  );
}
