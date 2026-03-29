import {
  EditorCheckbox,
  EditorInput,
  EditorSection,
} from './EditorPrimitives';
import type { FLAgTFormData } from '@/types';

interface FlagtFormEditorProps {
  data: FLAgTFormData;
  onChange: (next: FLAgTFormData) => void;
}

export default function FlagtFormEditor({ data, onChange }: FlagtFormEditorProps): JSX.Element {
  return (
    <div className="space-y-3">
      <EditorSection title="Project Declaration">
        <EditorInput
          label="Proponent Name"
          value={data.proponentName}
          onChange={(proponentName) => onChange({ ...data, proponentName })}
        />
        <EditorInput
          label="Project Name"
          value={data.projectName}
          onChange={(projectName) => onChange({ ...data, projectName })}
        />
        <EditorInput
          label="Municipality / Province"
          value={data.municipalityProvince}
          onChange={(municipalityProvince) => onChange({ ...data, municipalityProvince })}
        />
        <div className="grid grid-cols-2 gap-2">
          <EditorInput
            label="Land Area Requested (ha)"
            value={data.landAreaRequestedHectares}
            onChange={(landAreaRequestedHectares) => onChange({ ...data, landAreaRequestedHectares })}
          />
          <EditorInput
            label="Tenure Instrument"
            value={data.tenureInstrument}
            onChange={(tenureInstrument) => onChange({ ...data, tenureInstrument })}
          />
        </div>
        <EditorInput
          label="Forest Land Classification"
          value={data.forestLandClassification}
          onChange={(forestLandClassification) => onChange({ ...data, forestLandClassification })}
        />
      </EditorSection>

      <EditorSection title="Declarations">
        <EditorCheckbox
          label="Declaration Accepted"
          checked={data.declarationAccepted}
          onChange={(declarationAccepted) => onChange({ ...data, declarationAccepted })}
        />
        <EditorCheckbox
          label="Environmental Safeguards"
          checked={data.environmentalSafeguards}
          onChange={(environmentalSafeguards) => onChange({ ...data, environmentalSafeguards })}
        />
        <EditorCheckbox
          label="Community Consultation"
          checked={data.communityConsultation}
          onChange={(communityConsultation) => onChange({ ...data, communityConsultation })}
        />
      </EditorSection>

      <EditorSection title="Signatory">
        <EditorInput
          label="Signature Name"
          value={data.signatureName}
          onChange={(signatureName) => onChange({ ...data, signatureName })}
        />
        <EditorInput
          type="date"
          label="Signature Date"
          value={data.signatureDate}
          onChange={(signatureDate) => onChange({ ...data, signatureDate })}
        />
      </EditorSection>
    </div>
  );
}
