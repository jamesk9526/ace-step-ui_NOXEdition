export interface ModelFile {
  path: string;
  sizeBytes?: number;
}

export interface ModelPackage {
  id: string;
  name: string;
  description: string;
  required: boolean;
  estimatedSize: string;
  files: ModelFile[];
}

export const HF_REPO_ID = 'ACE-Step/Ace-Step1.5';
export const HF_REVISION = 'main';
export const HF_BASE_URL = 'https://huggingface.co';

/**
 * Constructs the direct-download URL for a file in a HuggingFace repo.
 * HF uses Git LFS – the /resolve/ endpoint returns the actual blob.
 */
export function hfResolveUrl(repoId: string, revision: string, filePath: string): string {
  return `${HF_BASE_URL}/${repoId}/resolve/${revision}/${filePath}`;
}

export const MODEL_PACKAGES: ModelPackage[] = [
  {
    id: 'core-model',
    name: 'ACE-Step v1.5 Turbo',
    description: 'Main music generation transformer model',
    required: true,
    estimatedSize: '~950 MB',
    files: [
      { path: 'checkpoints/config.json' },
      { path: 'checkpoints/acestep-v15-turbo/config.json' },
      { path: 'checkpoints/acestep-v15-turbo/configuration_acestep_v15.py' },
      { path: 'checkpoints/acestep-v15-turbo/modeling_acestep_v15_turbo.py' },
      { path: 'checkpoints/acestep-v15-turbo/silence_latent.pt' },
      { path: 'checkpoints/acestep-v15-turbo/model.safetensors', sizeBytes: 950_000_000 },
    ],
  },
  {
    id: 'vae',
    name: 'Audio VAE',
    description: 'Variational autoencoder for audio encoding/decoding',
    required: true,
    estimatedSize: '~300 MB',
    files: [
      { path: 'checkpoints/vae/config.json' },
      { path: 'checkpoints/vae/diffusion_pytorch_model.safetensors', sizeBytes: 300_000_000 },
    ],
  },
  {
    id: 'lm-1.7b',
    name: 'Language Model 1.7B',
    description: 'Lyrics-conditioning model — smaller & faster',
    required: false,
    estimatedSize: '~3.4 GB',
    files: [
      { path: 'checkpoints/acestep-5Hz-lm-1.7B/added_tokens.json' },
      { path: 'checkpoints/acestep-5Hz-lm-1.7B/chat_template.jinja' },
      { path: 'checkpoints/acestep-5Hz-lm-1.7B/config.json' },
      { path: 'checkpoints/acestep-5Hz-lm-1.7B/merges.txt' },
      { path: 'checkpoints/acestep-5Hz-lm-1.7B/special_tokens_map.json' },
      { path: 'checkpoints/acestep-5Hz-lm-1.7B/tokenizer.json' },
      { path: 'checkpoints/acestep-5Hz-lm-1.7B/tokenizer_config.json' },
      { path: 'checkpoints/acestep-5Hz-lm-1.7B/vocab.json' },
      { path: 'checkpoints/acestep-5Hz-lm-1.7B/model.safetensors', sizeBytes: 3_400_000_000 },
    ],
  },
  {
    id: 'lm-4b',
    name: 'Language Model 4B',
    description: 'Larger lyrics model — higher quality, more VRAM',
    required: false,
    estimatedSize: '~8 GB',
    files: [
      { path: 'checkpoints/acestep-5Hz-lm-4B/added_tokens.json' },
      { path: 'checkpoints/acestep-5Hz-lm-4B/chat_template.jinja' },
      { path: 'checkpoints/acestep-5Hz-lm-4B/config.json' },
      { path: 'checkpoints/acestep-5Hz-lm-4B/merges.txt' },
      { path: 'checkpoints/acestep-5Hz-lm-4B/special_tokens_map.json' },
      { path: 'checkpoints/acestep-5Hz-lm-4B/tokenizer.json' },
      { path: 'checkpoints/acestep-5Hz-lm-4B/tokenizer_config.json' },
      { path: 'checkpoints/acestep-5Hz-lm-4B/vocab.json' },
      { path: 'checkpoints/acestep-5Hz-lm-4B/model-00001-of-00002.safetensors', sizeBytes: 4_000_000_000 },
      { path: 'checkpoints/acestep-5Hz-lm-4B/model-00002-of-00002.safetensors', sizeBytes: 4_000_000_000 },
      { path: 'checkpoints/acestep-5Hz-lm-4B/model.safetensors.index.json' },
    ],
  },
  {
    id: 'embedding',
    name: 'Qwen3 Embedding 0.6B',
    description: 'Text embedding model for style matching',
    required: true,
    estimatedSize: '~1.2 GB',
    files: [
      { path: 'checkpoints/Qwen3-Embedding-0.6B/config.json' },
      { path: 'checkpoints/Qwen3-Embedding-0.6B/tokenizer.json' },
      { path: 'checkpoints/Qwen3-Embedding-0.6B/tokenizer_config.json' },
      { path: 'checkpoints/Qwen3-Embedding-0.6B/special_tokens_map.json' },
      { path: 'checkpoints/Qwen3-Embedding-0.6B/model.safetensors', sizeBytes: 1_200_000_000 },
    ],
  },
];
