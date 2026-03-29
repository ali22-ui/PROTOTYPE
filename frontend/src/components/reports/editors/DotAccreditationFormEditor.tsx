import {
  EditorCheckbox,
  EditorInput,
  EditorNumberInput,
  EditorSection,
  EditorTextarea,
} from './EditorPrimitives';
import type { DOTAccreditationFormData } from '@/types';

interface DotAccreditationFormEditorProps {
  data: DOTAccreditationFormData;
  onChange: (next: DOTAccreditationFormData) => void;
}

export default function DotAccreditationFormEditor({
  data,
  onChange,
}: DotAccreditationFormEditorProps): JSX.Element {
  return (
    <div className="space-y-3">
      <EditorSection title="Accreditation Profile">
        <EditorInput
          label="Establishment Name"
          value={data.establishmentName}
          onChange={(establishmentName) => onChange({ ...data, establishmentName })}
        />
        <div className="grid grid-cols-2 gap-2">
          <EditorInput
            label="Accreditation No."
            value={data.accreditationNo}
            onChange={(accreditationNo) => onChange({ ...data, accreditationNo })}
          />
          <EditorInput
            label="Reporting Month"
            value={data.reportingMonth}
            onChange={(reportingMonth) => onChange({ ...data, reportingMonth })}
          />
        </div>
        <EditorInput
          label="Managing Entity"
          value={data.managingEntity}
          onChange={(managingEntity) => onChange({ ...data, managingEntity })}
        />
        <div className="grid grid-cols-2 gap-2">
          <EditorInput
            label="Contact Number"
            type="tel"
            value={data.contactNumber}
            onChange={(contactNumber) => onChange({ ...data, contactNumber })}
          />
          <EditorInput
            label="Contact Email"
            type="email"
            value={data.contactEmail}
            onChange={(contactEmail) => onChange({ ...data, contactEmail })}
          />
        </div>
      </EditorSection>

      <EditorSection title="Safety Checklist">
        <EditorCheckbox
          label="First-Aid Kit"
          checked={data.firstAidKit}
          onChange={(firstAidKit) => onChange({ ...data, firstAidKit })}
        />
        <EditorCheckbox
          label="Fire Extinguishers"
          checked={data.fireExtinguishers}
          onChange={(fireExtinguishers) => onChange({ ...data, fireExtinguishers })}
        />
        <EditorCheckbox
          label="Evacuation Plan"
          checked={data.evacuationPlan}
          onChange={(evacuationPlan) => onChange({ ...data, evacuationPlan })}
        />
        <EditorCheckbox
          label="CCTV Monitoring"
          checked={data.cctvMonitoring}
          onChange={(cctvMonitoring) => onChange({ ...data, cctvMonitoring })}
        />
        <EditorCheckbox
          label="Trained Frontliners"
          checked={data.trainedFrontliners}
          onChange={(trainedFrontliners) => onChange({ ...data, trainedFrontliners })}
        />
        <EditorCheckbox
          label="Incident Logbook"
          checked={data.incidentLogbook}
          onChange={(incidentLogbook) => onChange({ ...data, incidentLogbook })}
        />
      </EditorSection>

      <EditorSection title="Demographics">
        <div className="grid grid-cols-2 gap-2">
          <EditorNumberInput label="Male" value={data.male} onChange={(male) => onChange({ ...data, male })} />
          <EditorNumberInput label="Female" value={data.female} onChange={(female) => onChange({ ...data, female })} />
          <EditorNumberInput
            label="Local Residents"
            value={data.localResidents}
            onChange={(localResidents) => onChange({ ...data, localResidents })}
          />
          <EditorNumberInput
            label="Non-local Residents"
            value={data.nonLocalResidents}
            onChange={(nonLocalResidents) => onChange({ ...data, nonLocalResidents })}
          />
          <EditorNumberInput
            label="Foreign Guests"
            value={data.foreignGuests}
            onChange={(foreignGuests) => onChange({ ...data, foreignGuests })}
          />
          <EditorNumberInput
            label="MICE Delegates"
            value={data.miceDelegates}
            onChange={(miceDelegates) => onChange({ ...data, miceDelegates })}
          />
        </div>
      </EditorSection>

      <EditorSection title="Remarks">
        <EditorTextarea
          label="Compliance Remarks"
          value={data.complianceRemarks}
          onChange={(complianceRemarks) => onChange({ ...data, complianceRemarks })}
          rows={3}
        />
      </EditorSection>
    </div>
  );
}
