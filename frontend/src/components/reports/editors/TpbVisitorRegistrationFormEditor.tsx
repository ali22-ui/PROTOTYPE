import {
  EditorCheckbox,
  EditorInput,
  EditorNumberInput,
  EditorSection,
  EditorTextarea,
} from './EditorPrimitives';
import type { TPBVisitorRegistrationFormData } from '@/types';

interface TpbVisitorRegistrationFormEditorProps {
  data: TPBVisitorRegistrationFormData;
  onChange: (next: TPBVisitorRegistrationFormData) => void;
}

export default function TpbVisitorRegistrationFormEditor({
  data,
  onChange,
}: TpbVisitorRegistrationFormEditorProps): JSX.Element {
  return (
    <div className="space-y-3">
      <EditorSection title="MICE Event Details">
        <EditorInput label="Event Name" value={data.eventName} onChange={(eventName) => onChange({ ...data, eventName })} />
        <EditorInput label="Event Type" value={data.eventType} onChange={(eventType) => onChange({ ...data, eventType })} />
        <EditorInput label="Organizer" value={data.organizer} onChange={(organizer) => onChange({ ...data, organizer })} />
        <EditorInput label="Venue" value={data.venue} onChange={(venue) => onChange({ ...data, venue })} />
        <div className="grid grid-cols-2 gap-2">
          <EditorInput
            type="date"
            label="Start Date"
            value={data.eventStartDate}
            onChange={(eventStartDate) => onChange({ ...data, eventStartDate })}
          />
          <EditorInput
            type="date"
            label="End Date"
            value={data.eventEndDate}
            onChange={(eventEndDate) => onChange({ ...data, eventEndDate })}
          />
        </div>
      </EditorSection>

      <EditorSection title="MICE Category">
        <EditorCheckbox label="Meeting" checked={data.meeting} onChange={(meeting) => onChange({ ...data, meeting })} />
        <EditorCheckbox label="Incentive" checked={data.incentive} onChange={(incentive) => onChange({ ...data, incentive })} />
        <EditorCheckbox label="Conference" checked={data.conference} onChange={(conference) => onChange({ ...data, conference })} />
        <EditorCheckbox label="Exhibition" checked={data.exhibition} onChange={(exhibition) => onChange({ ...data, exhibition })} />
      </EditorSection>

      <EditorSection title="Visitor Breakdown">
        <div className="grid grid-cols-3 gap-2">
          <EditorNumberInput label="Local Male" value={data.localMale} onChange={(localMale) => onChange({ ...data, localMale })} />
          <EditorNumberInput label="Local Female" value={data.localFemale} onChange={(localFemale) => onChange({ ...data, localFemale })} />
          <EditorNumberInput label="Local Total" value={data.localTotal} onChange={(localTotal) => onChange({ ...data, localTotal })} />

          <EditorNumberInput
            label="Non-local Male"
            value={data.nonLocalMale}
            onChange={(nonLocalMale) => onChange({ ...data, nonLocalMale })}
          />
          <EditorNumberInput
            label="Non-local Female"
            value={data.nonLocalFemale}
            onChange={(nonLocalFemale) => onChange({ ...data, nonLocalFemale })}
          />
          <EditorNumberInput
            label="Non-local Total"
            value={data.nonLocalTotal}
            onChange={(nonLocalTotal) => onChange({ ...data, nonLocalTotal })}
          />

          <EditorNumberInput
            label="Foreign Male"
            value={data.foreignMale}
            onChange={(foreignMale) => onChange({ ...data, foreignMale })}
          />
          <EditorNumberInput
            label="Foreign Female"
            value={data.foreignFemale}
            onChange={(foreignFemale) => onChange({ ...data, foreignFemale })}
          />
          <EditorNumberInput
            label="Foreign Total"
            value={data.foreignTotal}
            onChange={(foreignTotal) => onChange({ ...data, foreignTotal })}
          />
        </div>
      </EditorSection>

      <EditorSection title="Remarks">
        <EditorTextarea label="Remarks" value={data.remarks} onChange={(remarks) => onChange({ ...data, remarks })} rows={3} />
      </EditorSection>
    </div>
  );
}
