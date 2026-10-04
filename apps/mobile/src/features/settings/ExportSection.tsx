import { useState } from 'react';
import { View } from 'react-native';
import { Button, SectionHeader, Text } from '@/components/ui';
import { useTrack } from '@/lib/analytics';
import { reportError } from '@/lib/sentry';
import { toast } from '@/lib/toast';
import { exportData } from './export';

/** Settings → Your data: one-tap export of everything as a JSON file. */
export function ExportSection({ workspaceId }: { workspaceId: string }) {
  const [busy, setBusy] = useState(false);
  const track = useTrack();

  const run = async () => {
    setBusy(true);
    try {
      const bundle = await exportData(workspaceId);
      track('data_exported', {
        tasks: bundle.tables.tasks.length,
        notes: bundle.tables.notes.length,
        images: bundle.images.length,
      });
      toast.show('Export ready');
    } catch (e) {
      // Cancelling the folder picker or share sheet isn't an error worth reporting.
      if (!(e instanceof Error && /cancel/i.test(e.message))) {
        reportError(e, { fn: 'export' });
        toast.error('Couldn’t export your data. Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionHeader title="Your data" />
      <View className="gap-3 px-4">
        <Text variant="caption">
          Download everything (clients, projects, tasks, notes as Markdown, time, invoices, and the
          assistant’s history) as one JSON file. Image links in the file work for 7 days.
        </Text>
        <View className="flex-row">
          <Button
            testID="export-data"
            label={busy ? 'Preparing…' : 'Export my data'}
            icon="download"
            variant="secondary"
            disabled={busy}
            onPress={() => void run()}
          />
        </View>
      </View>
    </>
  );
}
