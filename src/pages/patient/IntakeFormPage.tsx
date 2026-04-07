// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Questionnaire, QuestionnaireItem, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, Loading, QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { onboardPatient } from '../../utils/intake-form';
import { showErrorNotification } from '../../utils/notifications';

export interface IntakeFormPageProps {
  skipValueSetCheck?: boolean;
  questionnaire?: Questionnaire;
}

export function IntakeFormPage({
  skipValueSetCheck = false,
  questionnaire: propQuestionnaire,
}: IntakeFormPageProps = {}): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [unavailableValueSets, setUnavailableValueSets] = useState<ValueSetInfo[]>([]);
  const [checkingValueSets, setCheckingValueSets] = useState(false);
  const questionnaire = propQuestionnaire ?? defaultQuestionnaire;

  useEffect(() => {
    const abortController = new AbortController();
    let isActive = true;

    async function checkValueSets(): Promise<void> {
      if (!isActive || skipValueSetCheck) {
        return;
      }
      setCheckingValueSets(true);

      if (!questionnaire) {
        if (isActive) {
          setCheckingValueSets(false);
        }
        return;
      }

      const allValueSets = extractValueSets(questionnaire.item);
      const uniqueValueSets = new Map<string, ValueSetInfo>();
      for (const vs of allValueSets) {
        if (!uniqueValueSets.has(vs.url)) {
          uniqueValueSets.set(vs.url, vs);
        }
      }
      const valueSets = Array.from(uniqueValueSets.values());

      const unavailable: ValueSetInfo[] = [];

      await Promise.allSettled(
        valueSets.map(async (vs) => {
          if (abortController.signal.aborted) {
            return;
          }
          const isAvailable = await checkValueSetAvailability(vs.url, medplum);
          if (!isAvailable && !abortController.signal.aborted) {
            unavailable.push(vs);
          }
        })
      );

      if (isActive && !abortController.signal.aborted) {
        setUnavailableValueSets(unavailable);
      }
    }

    checkValueSets()
      .catch((error) => {
        if (isActive && !abortController.signal.aborted) {
          showErrorNotification(error);
        }
      })
      .finally(() => {
        if (isActive) {
          setCheckingValueSets(false);
        }
      });

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [medplum, skipValueSetCheck, questionnaire]);

  const handleOnSubmit = useCallback(
    async (response: QuestionnaireResponse) => {
      if (!questionnaire || !profile) {
        return;
      }
      try {
        const patient = await onboardPatient(medplum, questionnaire, response);
        navigate(`/Patient/${patient.id}/case`)?.catch(console.error);
      } catch (error) {
        showNotification({
          color: 'red',
          message: normalizeErrorString(error),
          autoClose: false,
        });
      }
    },
    [medplum, navigate, profile, questionnaire]
  );

  return (
    <Document width={800}>
      {checkingValueSets && <Loading />}
      {/* {!checkingValueSets && unavailableValueSets.length > 0 && (
        <Alert color="red" title="Some valuesets are unavailable" mb="md">
          <p>
            The following questions may not display correctly because their valuesets are not available. Please contact
            sales to enable these valuesets.
          </p>
          <ul>
            {unavailableValueSets.map((vs) => (
              <li key={vs.linkId}>{vs.url}</li>
            ))}
          </ul>
        </Alert>
      )} */}
      <QuestionnaireForm questionnaire={questionnaire} onSubmit={handleOnSubmit} />
    </Document>
  );
}

interface ValueSetInfo {
  url: string;
  questionText: string;
  linkId: string;
}

/**
 * Recursively extracts all valueset URLs from questionnaire items
 * @param items - The questionnaire items to extract valuesets from
 * @param result - Accumulator array for valueset information
 * @returns Array of valueset information including URL, question text, and linkId
 */
function extractValueSets(items: QuestionnaireItem[] | undefined, result: ValueSetInfo[] = []): ValueSetInfo[] {
  if (!items) {
    return result;
  }

  for (const item of items) {
    if (item.answerValueSet) {
      result.push({
        url: item.answerValueSet,
        questionText: item.text || item.linkId || 'Unknown question',
        linkId: item.linkId || 'unknown',
      });
    }
    if (item.item) {
      extractValueSets(item.item, result);
    }
  }

  return result;
}

/**
 * Checks if a valueset is available by attempting to expand it
 * @param valueSetUrl - The URL of the valueset to check
 * @param medplum - The Medplum client instance
 * @returns Promise that resolves to true if valueset is available, false otherwise
 */
async function checkValueSetAvailability(
  valueSetUrl: string,
  medplum: ReturnType<typeof useMedplum>
): Promise<boolean> {
  try {
    await medplum.valueSetExpand({
      url: valueSetUrl,
      count: 1,
    });
    return true;
  } catch {
    return false;
  }
}

const defaultQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Patient Intake Questionnaire',
  url: 'https://medplum.com/Questionnaire/patient-intake-questionnaire-example',
  name: 'patient-intake',
  item: [
    {
      linkId: 'patient-demographics',
      text: 'Patient Demographics',
      type: 'group',
      item: [
        {
          linkId: 'first-name',
          text: 'First Name',
          type: 'string',
          required: true,
        },
        {
          linkId: 'last-name',
          text: 'Last Name',
          type: 'string',
          required: true,
        },
        {
          linkId: 'dob',
          text: 'Date of Birth',
          type: 'date',
          required: true,
        },
        {
          linkId: 'gender',
          text: 'Gender',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/ValueSet/administrative-gender',
          required: true,
        },
      ],
    },
    {
      linkId: 'contact-details',
      text: 'Contact Details',
      type: 'group',
      item: [
        {
          linkId: 'phone',
          text: 'Phone Number',
          type: 'string',
          required: true,
        },
        {
          linkId: 'email',
          text: 'Email',
          type: 'string',
        },
      ],
    },
    {
      linkId: 'address',
      text: 'Address',
      type: 'group',
      item: [
        {
          linkId: 'address-line1',
          text: 'Address Line 1',
          type: 'string',
          required: true,
        },
        {
          linkId: 'address-line2',
          text: 'Address Line 2',
          type: 'string',
        },
        {
          linkId: 'city',
          text: 'Town/City',
          type: 'string',
          required: true,
        },
        {
          linkId: 'county',
          text: 'County',
          type: 'string',
        },
        {
          linkId: 'postcode',
          text: 'Postcode',
          type: 'string',
          required: true,
        },
      ],
    },
    {
      linkId: 'coverage-information',
      text: 'Coverage Information',
      type: 'group',
      repeats: true,
      item: [
        {
          linkId: 'insurance-provider',
          text: 'Client/Organisation',
          type: 'reference',
          required: true,
          extension: [
            {
              id: 'reference-insurance',
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/fhir-types',
                    display: 'Organizations',
                    code: 'Organization',
                  },
                ],
              },
            },
          ],
        },
        {
          linkId: 'subscriber-id',
          text: 'Policy/Membership ID',
          type: 'string',
        },
        {
          linkId: 'relationship-to-subscriber',
          text: 'Relationship to Subscriber',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/ValueSet/subscriber-relationship',
        },
      ],
    },
    {
      linkId: 'case-creation',
      text: 'Intake Information',
      type: 'group',
      item: [
        {
          linkId: 'referral-date',
          text: 'Referral Date/Intake Date',
          type: 'date',
          required: true,
        },
        {
          linkId: 'case-status',
          text: 'Status',
          type: 'choice',
          required: true,
          answerValueSet: 'http://hl7.org/fhir/ValueSet/episode-of-care-status',
        },
        {
          linkId: 'service-type',
          text: 'Service Type',
          type: 'choice',
          required: true,
          answerValueSet: 'http://hl7.org/fhir/ValueSet/episodeofcare-type',
        },
        {
          linkId: 'mh-case-state',
          text: 'Mental Health Case State',
          type: 'choice',
          required: true,
          answerValueSet: 'https://iprsgroup.com/fhir/ValueSet/mh-case-state',
        },
      ],
    },
    {
      linkId: 'consent-for-treatment',
      text: 'Consent for Treatment',
      type: 'group',
      item: [
        {
          linkId: 'consent-for-treatment-signature',
          text: 'Consent to assessment and data processing.',
          type: 'boolean',
        },
        {
          linkId: 'consent-for-treatment-date',
          text: 'Date',
          type: 'date',
        },
      ],
    },
  ],
};
