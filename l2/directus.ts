import {createDirectusHelmChart} from "./providers/Charts/Directus";
import {DirectusConfig, Source} from "../util/types";
import {createDirectusManual} from "./providers/Manual/Directus";


export function createDirectusResources(by: Source, params: DirectusConfig) {
   switch (by) {
     case "manual":
       return createDirectusManual(params)
     case "gke":
       console.log("Not Implemented")
       return null
     case "azure":
       console.log("Not Implemented")
       return null
     case "helm":
       return createDirectusHelmChart(params.namespace, params.secret, params.config)
     case "aws":
       console.log("Not Implemented")
       return null


   }
}