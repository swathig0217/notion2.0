import { Platform, Share } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Phones: iOS opens the share sheet (Save to Files, AirDrop, Mail…); Android asks for a
 * folder and writes the file there. The temporary copy is removed afterwards.
 */
export async function saveTextFile(name: string, contents: string, mimeType: string) {
  if (Platform.OS === 'android') {
    const dir = await Directory.pickDirectoryAsync();
    const file = dir.createFile(name, mimeType);
    file.write(contents);
    return;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);
  try {
    await Share.share({ url: file.uri, title: name });
  } finally {
    file.delete();
  }
}
