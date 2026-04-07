// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Loader } from '@mantine/core';
import type { JSX } from 'react';
import { usePatient } from '../../hooks/usePatient';
import { Case } from './Case';

export function CaseTab(): JSX.Element {
  const patient = usePatient();
  if (!patient) {
    return <Loader />;
  }
  return <Case patient={patient} />;
}
