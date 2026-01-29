import { PrismaClient, CharacterStatus, CharacterVisibility, VoiceStyle, ResponseLength } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface CharacterJson {
  name: string;
  tagline: string;
  description: string;
  category: string;
  tags?: string[];
  personality: {
    systemPrompt: string;
    greeting: string;
    traits?: string[];
    background?: string;
    voice?: 'formal' | 'casual' | 'playful' | 'serious' | 'poetic' | 'technical';
    responseLength?: 'short' | 'medium' | 'long' | 'variable';
    exampleDialogues?: Array<{
      userMessage: string;
      characterMessage: string;
    }>;
  };
  visibility?: 'public' | 'unlisted' | 'private';
  isNsfw?: boolean;
  isFeatured?: boolean;
}

const voiceMap: Record<string, VoiceStyle> = {
  formal: VoiceStyle.FORMAL,
  casual: VoiceStyle.CASUAL,
  playful: VoiceStyle.PLAYFUL,
  serious: VoiceStyle.SERIOUS,
  poetic: VoiceStyle.POETIC,
  technical: VoiceStyle.TECHNICAL,
};

const responseLengthMap: Record<string, ResponseLength> = {
  short: ResponseLength.SHORT,
  medium: ResponseLength.MEDIUM,
  long: ResponseLength.LONG,
  variable: ResponseLength.VARIABLE,
};

const visibilityMap: Record<string, CharacterVisibility> = {
  public: CharacterVisibility.PUBLIC,
  unlisted: CharacterVisibility.UNLISTED,
  private: CharacterVisibility.PRIVATE,
};

async function importCharacter(filePath: string, creatorId: string): Promise<void> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data: CharacterJson = JSON.parse(content);

  const characterId = `imported-${data.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

  const character = await prisma.character.create({
    data: {
      id: characterId,
      creatorId,
      name: data.name,
      tagline: data.tagline,
      description: data.description,
      category: data.category,
      tags: data.tags || [],
      systemPrompt: data.personality.systemPrompt,
      greeting: data.personality.greeting,
      traits: data.personality.traits || [],
      background: data.personality.background || '',
      voice: voiceMap[data.personality.voice || 'casual'] || VoiceStyle.CASUAL,
      responseLength: responseLengthMap[data.personality.responseLength || 'medium'] || ResponseLength.MEDIUM,
      exampleDialogues: data.personality.exampleDialogues || [],
      visibility: visibilityMap[data.visibility || 'private'] || CharacterVisibility.PRIVATE,
      status: CharacterStatus.DRAFT,
      isNsfw: data.isNsfw || false,
      isFeatured: data.isFeatured || false,
    },
  });

  console.log(`✓ Imported character: ${character.name} (${character.id})`);
}

async function importAllCharacters(directory: string, creatorId: string): Promise<void> {
  const files = fs.readdirSync(directory).filter(f => f.endsWith('.json'));

  console.log(`Found ${files.length} character file(s) to import\n`);

  let imported = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(directory, file);
    try {
      await importCharacter(filePath, creatorId);
      imported++;
    } catch (error) {
      console.error(`✗ Failed to import ${file}:`, error instanceof Error ? error.message : error);
      failed++;
    }
  }

  console.log(`\nImport complete: ${imported} succeeded, ${failed} failed`);
}

async function main() {
  const args = process.argv.slice(2);

  // Get creator ID (required)
  let creatorId = args.find(a => a.startsWith('--creator='))?.split('=')[1];

  // If no creator specified, use admin user
  if (!creatorId) {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      console.error('Error: No admin user found. Please specify --creator=<userId>');
      process.exit(1);
    }
    creatorId = admin.id;
    console.log(`Using admin user as creator: ${admin.email}\n`);
  }

  // Check for single file import
  const singleFile = args.find(a => a.startsWith('--file='))?.split('=')[1];

  if (singleFile) {
    if (!fs.existsSync(singleFile)) {
      console.error(`Error: File not found: ${singleFile}`);
      process.exit(1);
    }
    await importCharacter(singleFile, creatorId);
  } else {
    // Import all from directory
    const dataDir = args.find(a => a.startsWith('--dir='))?.split('=')[1]
      || path.join(__dirname, '../data/characters');

    if (!fs.existsSync(dataDir)) {
      console.error(`Error: Directory not found: ${dataDir}`);
      console.log('Create the directory and add character JSON files, or use --file=<path>');
      process.exit(1);
    }

    await importAllCharacters(dataDir, creatorId);
  }
}

main()
  .catch((e) => {
    console.error('Import error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
