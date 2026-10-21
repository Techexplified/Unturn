export interface ProductReturnData {
  id: string;
  name: string;
  sku: string;
  image: string;
  returnRate: string;
  returns: number;
  mainIssue: string;
  issueType: "size-fit" | "not-as-expected" | "wrong-item" | "fabric-quality" | "damaged";
}

export interface ReturnCause {
  id: string;
  cause: string;
  returns: number;
  share: string;
  shareNum: number;
  color: string;
  trend: number[];
}

export interface Recommendation {
  id: number;
  productId?: string;
  targetId?: string;
  title: string;
  priority: "High Priority" | "Medium Priority";
  productName: string;
  category: string;
  cause: string;
  description: string;
  productImage: string;
  returns: number;
  returnRate?: string;
  estSavings: string;
  returnShare: string;
  whyThisMatters: {
    explanation: string;
    impactItems: string[];
  };
  reasoning: {
    overview: string;
    customerVerbatim: string[];
    topDriver: string;
    suggestedAction: string;
  };
}


