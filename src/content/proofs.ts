import { requirePublicRecord } from "./publication";
import { proofRecordSchema } from "./schema";
import type { AssetProvenance } from "./schema";

const FROZEN_QHUB_SOURCE = Object.freeze({
  sourceRepository: "https://github.com/AmirNatan1/Q-HUB.git",
  frozenSourceSha: "70d8b5cc193311b9548c49399dde6a014583e13a",
});

function maradinAsset(path: string, sha256: string): AssetProvenance {
  return Object.freeze({
    ...FROZEN_QHUB_SOURCE,
    sourcePath: path,
    destinationPath: path,
    sourceSha256: sha256,
    destinationSha256: sha256,
    publicationClassification: "B",
    approvalState: "approved",
  });
}

const heroMedia = {
  id: "maradin-field-aperture-video",
  kind: "video",
  src: "/media/maradin/maradin-field-aperture-approved.mp4",
  alt: "A vehicle moving through a real field environment during dynamic ground projection testing.",
  width: 1920,
  height: 1080,
  publicApproved: true,
  publicationStatus: "approved",
  provenance: [
    maradinAsset(
      "public/media/maradin/maradin-field-aperture-approved.mp4",
      "daaec510c528bd7f72a97cfce1d9ede3359ec1339e28e26f524d127f09bf247c",
    ),
  ],
} as const;

const supportingMedia = [
  {
    id: "maradin-field-aperture-poster",
    kind: "image",
    src: "/media/maradin/maradin-field-aperture-poster-approved.jpg",
    alt: "A vehicle on a road at night in a real field environment.",
    width: 1920,
    height: 1080,
    publicApproved: true,
    publicationStatus: "approved",
    provenance: [
      maradinAsset(
        "public/media/maradin/maradin-field-aperture-poster-approved.jpg",
        "6afc1a69570f2541b89b4f6a5074bec04a5d607743d91670321f550b4d6364bd",
      ),
    ],
  },
  {
    id: "maradin-test-contact-video",
    kind: "video",
    src: "/media/maradin/maradin-test-contact-approved.mp4",
    alt: "Vehicle-mounted field testing in a real operating environment.",
    width: 1920,
    height: 1080,
    publicApproved: true,
    publicationStatus: "approved",
    provenance: [
      maradinAsset(
        "public/media/maradin/maradin-test-contact-approved.mp4",
        "076aecf40d9e67ac29eb0b8e2d34ffc374619862a9679a6e44bc08ccfd2c113d",
      ),
    ],
  },
  {
    id: "maradin-prove-field-frame",
    kind: "image",
    src: "/media/maradin/maradin-prove-field-frame-approved.jpg",
    alt: "A red stop-hand symbol projected onto a road surface during field testing.",
    width: 1920,
    height: 1080,
    publicApproved: true,
    publicationStatus: "approved",
    provenance: [
      maradinAsset(
        "public/media/maradin/maradin-prove-field-frame-approved.jpg",
        "b85f1bd5413b6fe7da235e5217e16b106ae4ff0763e8deb9db6e509dbc0b8b8c",
      ),
    ],
  },
  {
    id: "maradin-real-field-still",
    kind: "image",
    src: "/media/maradin/maradin-real-field-still-approved.jpg",
    alt: "A Hyundai CRADLE vehicle parked in an open parking structure.",
    width: 3840,
    height: 2160,
    publicApproved: true,
    publicationStatus: "approved",
    provenance: [
      maradinAsset(
        "public/media/maradin/maradin-real-field-still-approved.jpg",
        "49ab9aca0d2e3ef9e9ce164f43f9dbd1514ef815179626bef2bb4217827a6741",
      ),
    ],
  },
] as const;

const maradinCandidate = {
  id: "maradin-dynamic-ground-projection",
  slug: "maradin",
  title: "Maradin — Dynamic Ground Projection",
  summary: "A real-world field test of Maradin’s MEMS-based laser scanning technology for vehicle-to-road visual communication.",
  challenge: "A need for clearer visual communication between vehicles and nearby road users across real-world operating conditions.",
  technology: "Maradin’s MEMS-based laser scanning dynamic ground projection.",
  testDesign: "Vehicle-mounted field testing across projector positions, road surfaces, lighting conditions and weather conditions.",
  execution: "The field test compared brightness, image distortion and clarity across varying operating conditions.",
  evidence: "The POC produced comparative field evidence across those real-world conditions. Exact internal KPI tables and proprietary measurement data remain non-public.",
  nextStep: "Following an EcoMotion showcase, Maradin was selected for Hyundai’s OI Lounge exhibition in Korea. A more advanced iteration was integrated into the vehicle’s front grille for that event.",
  relatedCapabilities: ["POC design", "Field-test execution", "Evidence synthesis"],
  heroMedia,
  media: supportingMedia,
  partnerApproved: true,
  startupApproved: true,
  publicApproved: true,
  publicationStatus: "approved",
} as const;

const claimFields = [
  maradinCandidate.summary,
  maradinCandidate.challenge,
  maradinCandidate.technology,
  maradinCandidate.testDesign,
  maradinCandidate.execution,
  maradinCandidate.evidence,
  maradinCandidate.nextStep,
];

if (claimFields.some((claim) => /\d/.test(claim))) {
  throw new Error("Numeric Maradin claims are not approved for public export.");
}

export const maradinProofRecord = requirePublicRecord(proofRecordSchema, maradinCandidate);
export const publicProofRecords = Object.freeze([maradinProofRecord] as const);
