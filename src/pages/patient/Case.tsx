// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { formatCodeableConcept, formatDate, getReferenceString } from '@medplum/core';
import type { EpisodeOfCare, Patient } from '@medplum/fhirtypes';
import { ResourceBadge, useMedplum } from '@medplum/react';
import { IconAlertCircle, IconBrain } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

interface CaseProps {
  patient: Patient;
}

export function Case({ patient }: CaseProps): JSX.Element {
  const medplum = useMedplum();
  const [episodesOfCare, setEpisodesOfCare] = useState<EpisodeOfCare[]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const WIDTH = 160;

  useEffect(() => {
    const patientRef = getReferenceString(patient);
    if (!patientRef) {
      setError('Invalid patient reference');
      setLoading(false);
      return;
    }

    medplum
      .searchResources('EpisodeOfCare', { patient: patientRef })
      .then(async (episodes) => {
        // Fetch all episodes in parallel to get full data including extensions
        const fullEpisodes = await Promise.all(
          episodes.filter((ep) => ep.id).map((ep) => medplum.readResource('EpisodeOfCare', ep.id!))
        );
        setEpisodesOfCare(fullEpisodes);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load episodes of care');
        setLoading(false);
      });
  }, [medplum, patient]);

  if (loading) {
    return <Loader />;
  }

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
        {error}
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      {/* Patient Information */}
      <Paper shadow="xs" p="md" withBorder w="95%" mx="auto" mt="xl">
        <Title order={3} mb="md">
          Patient Information
        </Title>
        <Stack gap="sm">
          <Group>
            <Text fw={500} w={WIDTH}>
              Name:
            </Text>
            <Text>{patient.name?.[0] ? `${patient.name[0].given?.join(' ')} ${patient.name[0].family}` : 'N/A'}</Text>
          </Group>
          <Group>
            <Text fw={500} w={WIDTH}>
              Date of Birth:
            </Text>
            <Text>{patient.birthDate ? formatDate(patient.birthDate) : 'N/A'}</Text>
          </Group>
          <Group>
            <Text fw={500} w={WIDTH}>
              Gender:
            </Text>
            <Text>{patient.gender || 'N/A'}</Text>
          </Group>
          <Group>
            <Text fw={500} w={WIDTH}>
              MRN:
            </Text>
            <Text>{patient.identifier?.[0]?.value || 'N/A'}</Text>
          </Group>
        </Stack>
      </Paper>

      {/* Episodes of Care */}
      <Paper shadow="xs" p="md" withBorder w="95%" mx="auto">
        <Group justify="space-between" mb="md">
          <Title order={3}>Episodes of Care</Title>
          <Badge leftSection={<IconBrain size={14} />}>{episodesOfCare?.length || 0} Case(s)</Badge>
        </Group>

        {!episodesOfCare || episodesOfCare.length === 0 ? (
          <Alert icon={<IconAlertCircle size={16} />} title="No Cases Found" color="blue">
            No episodes of care found for this patient.
          </Alert>
        ) : (
          <Stack gap="md">
            {episodesOfCare.map((episode) => (
              <Paper key={episode.id} p="md" withBorder shadow="sm">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <ResourceBadge value={episode} link />
                    <Badge color={getStatusColor(episode.status)}>{episode.status}</Badge>
                  </Group>

                  {/* {episode.type && episode.type.length > 0 && ( */}
                  <Group>
                    <Text fw={500} w={WIDTH}>
                      Service Type:
                    </Text>
                    <Text>{formatCodeableConcept(episode?.type?.[0])}</Text>
                  </Group>

                  {episode.period && (
                    <Group>
                      <Text fw={500} w={WIDTH}>
                        Opened date:
                      </Text>
                      <Text>{episode.period.start ? formatDate(episode.period.start) : 'N/A'}</Text>
                    </Group>
                  )}

                  <Group>
                    <Text fw={500} w={WIDTH}>
                      MH Case State:
                    </Text>
                    <Text>
                      {episode?.extension?.find(
                        (ext) => ext.url === 'https://iprsgroup.com/fhir/StructureDefinition/mh-case-state'
                      )?.valueCoding?.display || 'N/A'}
                    </Text>
                  </Group>

                  {episode.diagnosis && episode.diagnosis.length > 0 && (
                    <Group align="flex-start">
                      <Text fw={500} w={WIDTH}>
                        Diagnoses:
                      </Text>
                      <Stack gap="xs">
                        {episode.diagnosis.map((diag, idx) => (
                          <ResourceBadge key={idx} value={diag.condition} link />
                        ))}
                      </Stack>
                    </Group>
                  )}

                  {/* {episode.managingOrganization && ( */}
                  <Group>
                    <Text fw={500} w={WIDTH}>
                      Managing Organisation:
                    </Text>
                    <ResourceBadge value={episode.managingOrganization} link />
                  </Group>
                  {/* )} */}

                  {/* {episode.careManager && ( */}
                  <Group>
                    <Text fw={500} w={WIDTH}>
                      Care Manager:
                    </Text>
                    <ResourceBadge value={episode.careManager} link />
                  </Group>
                  {/* )} */}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}

function getStatusColor(status: EpisodeOfCare['status']): string {
  switch (status) {
    case 'active':
      return 'green';
    case 'planned':
      return 'green';
    case 'waitlist':
      return 'yellow';
    case 'onhold':
      return 'orange';
    case 'finished':
      return 'gray';
    case 'cancelled':
      return 'red';
    case 'entered-in-error':
      return 'red';
    default:
      return 'gray';
  }
}
