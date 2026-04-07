// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { addProfileToResource, createReference, getQuestionnaireAnswers } from '@medplum/core';
import type { EpisodeOfCare, Patient, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import {
  addConsent,
  addCoverage,
  addExtension,
  addLanguage,
  consentCategoryMapping,
  consentPolicyRuleMapping,
  consentScopeMapping,
  convertDateToDateTime,
  extensionURLMapping,
  getContactDetails,
  getGroupRepeatedAnswers,
  getHumanName,
  getPatientAddress,
  PROFILE_URLS,
} from './intake-utils';

export async function onboardPatient(
  medplum: MedplumClient,
  questionnaire: Questionnaire,
  response: QuestionnaireResponse
): Promise<Patient> {
  const answers = getQuestionnaireAnswers(response);

  let patient: Patient = {
    resourceType: 'Patient',
  };

  patient = addProfileToResource(patient, PROFILE_URLS.Patient);

  // Handle demographic information

  const patientName = getHumanName(answers);
  if (patientName) {
    patient.name = [patientName];
  }

  if (answers['dob']?.valueDate) {
    patient.birthDate = answers['dob'].valueDate;
  }

  const contactDetails = getContactDetails(answers);
  if (contactDetails) {
    patient.telecom = contactDetails;
  }

  const patientAddress = getPatientAddress(answers);
  if (patientAddress) {
    patient.address = [patientAddress];
  }

  if (answers['gender']?.valueCoding?.code) {
    patient.gender = answers['gender'].valueCoding.code as Patient['gender'];
  }

  if (answers['phone']?.valueString) {
    patient.telecom = [{ system: 'phone', value: answers['phone'].valueString }];
  }

  // if (answers['ssn']?.valueString) {
  patient.identifier = [
    {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
            code: 'SS',
          },
        ],
      },
      system: 'http://hl7.org/fhir/sid/us-ssn',
      value: Math.random().toString(36).substring(2, 15),
    },
  ];

  addExtension(patient, extensionURLMapping.race, 'valueCoding', answers['race'], 'ombCategory');
  addExtension(patient, extensionURLMapping.ethnicity, 'valueCoding', answers['ethnicity'], 'ombCategory');
  addExtension(patient, extensionURLMapping.veteran, 'valueBoolean', answers['veteran-status']);

  addLanguage(patient, answers['languages-spoken']?.valueCoding);
  addLanguage(patient, answers['preferred-language']?.valueCoding, true);

  // Create the patient resource
  patient = await medplum.createResource(patient);

  // NOTE: Updating the questionnaire response does not trigger a loop because the bot subscription
  // is configured for "create"-only event.
  response.subject = createReference(patient);
  await medplum.createResource(response);

  let episodeOfCare: EpisodeOfCare = {
    resourceType: 'EpisodeOfCare',
    status: 'planned',
    patient: createReference(patient),
  };

  if (answers['referral-date']?.valueDate) {
    episodeOfCare.period = { start: answers['referral-date'].valueDate };
  }

  if (answers['status']?.valueCoding) {
    episodeOfCare.status = answers['status'].valueCoding.code as EpisodeOfCare['status'];
  }

  if (answers['service-type']?.valueCoding) {
    episodeOfCare.type = [
      {
        coding: [answers['service-type'].valueCoding],
      },
    ];
  }

  // Add MH case state extension and meta tag if provided
  if (answers['mh-case-state']?.valueCoding) {
    const caseStateCoding = answers['mh-case-state'].valueCoding;

    // Add as extension for detailed data (using valueCoding to preserve display text)
    episodeOfCare.extension = episodeOfCare.extension || [];
    episodeOfCare.extension.push({
      url: 'https://iprsgroup.com/fhir/StructureDefinition/mh-case-state',
      valueCoding: caseStateCoding,
    });

    // Add as meta tag for searchability
    episodeOfCare.meta = episodeOfCare.meta || {};
    episodeOfCare.meta.tag = episodeOfCare.meta.tag || [];
    episodeOfCare.meta.tag.push({
      system: 'https://iprsgroup.com/case-state',
      code: caseStateCoding.code,
    });
  }

  episodeOfCare = await medplum.createResource(episodeOfCare);

  const insuranceProviders = getGroupRepeatedAnswers(questionnaire, response, 'coverage-information');
  for (const provider of insuranceProviders) {
    await addCoverage(medplum, patient, provider);
  }

  await addConsent(
    medplum,
    patient,
    !!answers['consent-for-treatment-signature']?.valueBoolean,
    consentScopeMapping.treatment,
    consentCategoryMapping.med,
    consentPolicyRuleMapping.cric,
    convertDateToDateTime(answers['consent-for-treatment-date']?.valueDate)
  );

  return patient;
}
